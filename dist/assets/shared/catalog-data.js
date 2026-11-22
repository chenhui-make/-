(() => {
    const cats = [
        ["cpu", "▧", "处理器", "CPU", "每一次流畅体验，都从核心开始。"],
        ["gpu", "▤", "显卡", "GPU", "让每一帧画面，都值得期待。"],
        ["board", "▦", "主板", "Motherboard", "连接所有可能，搭建稳定基石。"],
        ["ssd", "▰", "固态硬盘", "SSD", "让灵感加载，不再等待。"],
        ["ram", "▥", "内存", "Memory", "从容应对，多任务工作流。"],
        ["fan", "❋", "散热风扇", "Cooling", "冷静运行，尽情释放。"],
        ["psu", "▣", "电源", "PSU", "为强大性能提供稳定动力。"],
        ["case", "▯", "机箱", "Case", "为你的硬件找到理想的家。"],
        ["monitor", "▱", "显示器", "Monitor", "透过屏幕，看见更多细节。"],
        ["keyboard", "▤", "键盘", "Keyboard", "每一次敲击，都恰到好处。"],
        ["mouse", "◒", "鼠标", "Mouse", "精准掌控每一次操作。"],
        ["headset", "Ω", "耳机", "Headset", "沉浸其中，听见每一处细节。"],
        ["speaker", "◉", "音响", "Speaker", "让声音充满你的空间。"],
    ];
    let seq = 0;
    const item = (name, brand, price, spec, extra = {}) => ({
        id: ++seq,
        name,
        brand,
        price,
        spec,
        ...extra,
    });
    const db = {
        cpu: [
            item("Intel Core i5-14600KF", "Intel", 1599, "14 核心 / 20 线程 · 最高 5.3 GHz", {
                socket: "LGA1700",
                power: 181,
                tag: "人气之选",
                chip: "i5",
            }),
            item("AMD Ryzen 7 7800X3D", "AMD", 2499, "8 核心 / 16 线程 · 96MB L3 缓存", {
                socket: "AM5",
                power: 120,
                tag: "游戏利器",
                chip: "R7",
            }),
            item("Intel Core i7-14700K", "Intel", 2799, "20 核心 / 28 线程 · 最高 5.6 GHz", {
                socket: "LGA1700",
                power: 253,
                tag: "创作优选",
                chip: "i7",
            }),
            item("AMD Ryzen 5 7600", "AMD", 1199, "6 核心 / 12 线程 · 最高 5.1 GHz", {
                socket: "AM5",
                power: 88,
                tag: "高性价比",
                chip: "R5",
            }),
        ],
        gpu: [
            item("GeForce RTX 4070 SUPER", "NVIDIA", 4799, "12GB GDDR6X · 2K 游戏 · 光线追踪", {
                power: 220,
                tag: "2K 甜品卡",
            }),
            item("Radeon RX 7800 XT", "AMD", 3599, "16GB GDDR6 · 2K 高刷", { power: 263 }),
            item("GeForce RTX 4060", "NVIDIA", 2199, "8GB GDDR6 · 1080P 游戏", { power: 115 }),
        ],
        board: [
            item("MAG B760M MORTAR WIFI II", "MSI", 1099, "M-ATX · Wi-Fi 6E · DDR5", {
                socket: "LGA1700",
                ddr: "DDR5",
                tag: "稳定之选",
            }),
            item("TUF GAMING B650M-PLUS", "ASUS", 1199, "M-ATX · AM5 · DDR5", {
                socket: "AM5",
                ddr: "DDR5",
            }),
            item("B760M DS3H DDR4", "GIGABYTE", 699, "M-ATX · LGA1700 · DDR4", {
                socket: "LGA1700",
                ddr: "DDR4",
            }),
        ],
        ssd: [
            item("990 PRO 1TB", "Samsung", 699, "PCIe 4.0 · NVMe · 7450 MB/s", { tag: "极速读写" }),
            item("WD BLACK SN850X 2TB", "Western Digital", 999, "PCIe 4.0 · NVMe · 7300 MB/s"),
            item("TiPlus7100 1TB", "致态", 459, "PCIe 4.0 · NVMe · 7000 MB/s"),
        ],
        ram: [
            item("FURY Beast 32GB (16GB × 2)", "Kingston", 699, "DDR5 · 6000MHz · CL36", {
                ddr: "DDR5",
                tag: "双通道套装",
            }),
            item("VENGEANCE 32GB (16GB × 2)", "Corsair", 749, "DDR5 · 6000MHz · CL30", {
                ddr: "DDR5",
            }),
            item("FURY Beast 16GB (8GB × 2)", "Kingston", 259, "DDR4 · 3200MHz · CL16", {
                ddr: "DDR4",
            }),
        ],
        fan: [
            item(
                "Peerless Assassin 120 SE",
                "Thermalright",
                169,
                "双塔风冷 · 双 120mm 风扇 · 含安装扣具",
                { tag: "静音散热" },
            ),
            item("LS520 SE 240 水冷", "DeepCool", 399, "240mm 一体水冷 · ARGB"),
        ],
        psu: [
            item("FOCUS GX-750", "Seasonic", 699, "750W · 80 PLUS 金牌 · 全模组", {
                watts: 750,
                tag: "金牌全模组",
            }),
            item("RM850e", "Corsair", 899, "850W · 80 PLUS 金牌 · 全模组", { watts: 850 }),
            item("NE550", "Antec", 299, "550W · 80 PLUS 铜牌", { watts: 550 }),
        ],
        case: [
            item("CH360 数显机箱", "DeepCool", 399, "M-ATX · 网孔进风 · 侧透"),
            item("AIR 100 ARGB", "Montech", 299, "M-ATX · 侧透 · 含 4 风扇"),
        ],
        monitor: [
            item("27 英寸 2K 180Hz 电竞屏", "AOC", 1299, "2560 × 1440 · IPS · 180Hz", {
                tag: "高刷视界",
            }),
            item("27 英寸 4K 设计屏", "Dell", 2799, "3840 × 2160 · IPS · 99% sRGB"),
        ],
        keyboard: [
            item("V75 机械键盘", "VGN", 299, "75% 配列 · 三模连接 · 热插拔"),
            item("K8 Pro 机械键盘", "Keychron", 599, "87 键 · 蓝牙 / 有线 · RGB"),
        ],
        mouse: [
            item("G PRO X SUPERLIGHT", "Logitech", 799, "无线 · 63g · HERO 25K"),
            item("蜻蜓 F1 PRO", "VGN", 199, "无线 · 49g · PAW3395"),
        ],
        headset: [
            item("Cloud III 飓风 3", "HyperX", 499, "有线 · 53mm 单元 · 可拆麦克风"),
            item("G435 无线游戏耳机", "Logitech", 299, "蓝牙 / 2.4G · 165g"),
        ],
        speaker: [
            item("R1700BT 桌面音箱", "Edifier", 599, "2.0 声道 · 蓝牙 · 木质箱体"),
            item("Pebble V3", "Creative", 249, "USB-C · 蓝牙 · 桌面 2.0"),
        ],
    };

    window.RigCatalog = { cats, base: db };
})();
