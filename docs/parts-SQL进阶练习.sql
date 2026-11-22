-- 装机研究所 parts 表进阶练习
-- 数据源为项目 PostgreSQL 的 riglab.parts 和 riglab.categories。
-- 在 pgAdmin 连接 RIGLAB，先看题目并自己写，再选中对应参考查询执行。
-- 脚本只包含查询和 EXPLAIN，可以整份运行。结果随当前商品库变化。
-- 时间题使用数据库会话时区。价格为配件库参考价。

-- 题目
-- 01 统计每类上架数、下架数、总数及上架率，保留零商品分类。
-- 02 输出上架商品中各类缺失购买入口的数量和比例。NULL 和全空格都算缺失。
-- 03 给上架配件划分价格带（低于 500、500 至不足 1000、1000 至不足 2000、2000 及以上），计算类内占比。
-- 04 找每类上架商品价格最低的前三款，价格相同按 id 排序。
-- 05 找每类上架商品最低的三个不同价格档，同价型号全部保留。
-- 06 查出价格高于本类别上架均价 30% 的型号，显示均价和高出百分比。
-- 07 查各类上架价格的中位数和第 90 百分位，并显示样本数。
-- 08 对比本月和上月各类创建的商品记录数，显示增量和环比。
-- 09 查出没有同插槽上架主板的上架 CPU，把 CPU 插槽缺失单独标出。
-- 10 给定 2000 元，列出插槽和 DDR 都匹配的 CPU、主板、内存组合，取最便宜的 10 套。
-- 11 排查疑似重复型号。品类相同、品牌及型号忽略大小写和首尾空格后相同。
-- 12 查看“上架显卡按价排序取前五”的执行计划，思考联合索引设计。

-- 01 分类概况
SELECT c.code, c.name,
       COUNT(p.id) FILTER (WHERE p.status = 'active') AS active_count,
       COUNT(p.id) FILTER (WHERE p.status = 'inactive') AS inactive_count,
       COUNT(p.id) AS total_count,
       ROUND(100.0 * COUNT(p.id) FILTER (WHERE p.status = 'active')
             / NULLIF(COUNT(p.id), 0), 2) AS active_pct
FROM riglab.categories AS c
LEFT JOIN riglab.parts AS p ON p.category = c.code
GROUP BY c.code, c.name, c.sort_order
ORDER BY c.sort_order;

-- 02 购买入口缺失率
SELECT c.name,
       COUNT(p.id) AS active_count,
       COUNT(p.id) FILTER (WHERE NULLIF(BTRIM(p.purchase_url), '') IS NULL) AS missing_count,
       ROUND(100.0 * COUNT(p.id) FILTER (WHERE NULLIF(BTRIM(p.purchase_url), '') IS NULL)
             / NULLIF(COUNT(p.id), 0), 2) AS missing_pct
FROM riglab.categories AS c
LEFT JOIN riglab.parts AS p ON p.category = c.code AND p.status = 'active'
GROUP BY c.code, c.name, c.sort_order
ORDER BY missing_pct DESC NULLS LAST, c.sort_order;

-- 03 价格带和类内占比
WITH banded AS (
    SELECT category,
           CASE WHEN price < 500 THEN 1
                WHEN price < 1000 THEN 2
                WHEN price < 2000 THEN 3
                ELSE 4 END AS price_band
    FROM riglab.parts
    WHERE status = 'active'
),
band_counts AS (
    SELECT category, price_band, COUNT(*) AS part_count
    FROM banded
    GROUP BY category, price_band
)
SELECT category, price_band, part_count,
       ROUND(100.0 * part_count / SUM(part_count) OVER (PARTITION BY category), 2)
           AS category_pct
FROM band_counts
ORDER BY category, price_band;

-- 04 每类恰好最多三款
WITH ranked AS (
    SELECT id, category, name, price,
           ROW_NUMBER() OVER (PARTITION BY category ORDER BY price, id) AS price_rank
    FROM riglab.parts
    WHERE status = 'active'
)
SELECT *
FROM ranked
WHERE price_rank <= 3
ORDER BY category, price_rank;

-- 05 每类前三个价格档，窗口排序只使用 price，以便保留并列
WITH ranked AS (
    SELECT id, category, name, price,
           DENSE_RANK() OVER (PARTITION BY category ORDER BY price) AS price_rank
    FROM riglab.parts
    WHERE status = 'active'
)
SELECT *
FROM ranked
WHERE price_rank <= 3
ORDER BY category, price_rank, id;

-- 06 对比类别均价。筛选使用未四舍五入的均价。
WITH compared AS (
    SELECT id, category, name, price,
           AVG(price) OVER (PARTITION BY category) AS category_avg
    FROM riglab.parts
    WHERE status = 'active'
)
SELECT id, category, name, price,
       ROUND(category_avg, 2) AS avg_price,
       ROUND(100.0 * (price - category_avg) / NULLIF(category_avg, 0), 2) AS above_avg_pct
FROM compared
WHERE price > 1.30 * category_avg
ORDER BY above_avg_pct DESC, id;

-- 07 连续百分位可能落在两个实际价格之间
SELECT category, COUNT(*) AS sample_size,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price))::numeric, 2) AS median_price,
       ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY price))::numeric, 2) AS p90_price
FROM riglab.parts
WHERE status = 'active'
GROUP BY category
ORDER BY category;

-- 08 created_at 反映记录创建时间。本月只统计截至当前的数据。
WITH bounds AS (
    SELECT DATE_TRUNC('month', CURRENT_TIMESTAMP) AS this_start,
           DATE_TRUNC('month', CURRENT_TIMESTAMP) - INTERVAL '1 month' AS last_start
),
monthly AS (
    SELECT c.code, c.name,
           COUNT(p.id) FILTER (WHERE p.created_at >= b.this_start) AS this_month_count,
           COUNT(p.id) FILTER (WHERE p.created_at < b.this_start) AS last_month_count
    FROM riglab.categories AS c
    CROSS JOIN bounds AS b
    LEFT JOIN riglab.parts AS p
        ON p.category = c.code
       AND p.created_at >= b.last_start
       AND p.created_at <= CURRENT_TIMESTAMP
    GROUP BY c.code, c.name
)
SELECT code, name, this_month_count, last_month_count,
       this_month_count - last_month_count AS delta,
       ROUND(100.0 * (this_month_count - last_month_count)
             / NULLIF(last_month_count, 0), 2) AS mom_pct
FROM monthly
ORDER BY code;

-- 09 反连接。按字段中的插槽值匹配，空白按缺失处理。
SELECT cpu.id, cpu.name, cpu.socket,
       CASE WHEN NULLIF(BTRIM(cpu.socket), '') IS NULL THEN 'CPU 插槽缺失'
            ELSE '无同插槽上架主板' END AS issue
FROM riglab.parts AS cpu
WHERE cpu.category = 'cpu'
  AND cpu.status = 'active'
  AND (
      NULLIF(BTRIM(cpu.socket), '') IS NULL
      OR NOT EXISTS (
          SELECT 1
          FROM riglab.parts AS board
          WHERE board.category = 'board'
            AND board.status = 'active'
            AND board.socket = cpu.socket
      )
  )
ORDER BY cpu.id;

-- 10 只验证这三件配件的插槽、内存代际和合计预算
SELECT cpu.name AS cpu_name, board.name AS board_name, ram.name AS ram_name,
       cpu.socket, board.ddr,
       cpu.price + board.price + ram.price AS total_price
FROM riglab.parts AS cpu
JOIN riglab.parts AS board
    ON board.category = 'board' AND board.status = 'active'
   AND board.socket = cpu.socket
JOIN riglab.parts AS ram
    ON ram.category = 'ram' AND ram.status = 'active'
   AND ram.ddr = board.ddr
WHERE cpu.category = 'cpu'
  AND cpu.status = 'active'
  AND NULLIF(BTRIM(cpu.socket), '') IS NOT NULL
  AND NULLIF(BTRIM(board.ddr), '') IS NOT NULL
  AND cpu.price + board.price + ram.price <= 2000
ORDER BY total_price, cpu.id, board.id, ram.id
LIMIT 10;

-- 11 现有唯一索引使用 lower，以下检查额外消除首尾空格
SELECT category, LOWER(BTRIM(brand)) AS brand_key, LOWER(BTRIM(name)) AS name_key,
       COUNT(*) AS row_count, ARRAY_AGG(id ORDER BY id) AS part_ids
FROM riglab.parts
GROUP BY category, LOWER(BTRIM(brand)), LOWER(BTRIM(name))
HAVING COUNT(*) > 1
ORDER BY row_count DESC, category, brand_key, name_key;

-- 12 思考部分索引 (category, price, id) WHERE status = 'active' 的适用场景
EXPLAIN
SELECT id, name, price
FROM riglab.parts
WHERE category = 'gpu' AND status = 'active'
ORDER BY price, id
LIMIT 5;
