from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
from copy import deepcopy
import hashlib,json
base=Path('G:/项目—装机研究所'); tmp=base/'.resume_merge'
src=base/'docs/马晨辉-微派数据分析实习简历-蓝色同款版.docx'
out=base/'docs/马晨辉-微派数据分析实习简历-蓝色丰富优化版.docx'
z=ZipFile(src); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','v':'urn:schemas-microsoft-com:vml'}
root=E.fromstring(z.read('word/document.xml'))
(tmp/'artifact.md').write_text('Reference: '+str(src)+'\nSHA256: '+hashlib.sha256(src.read_bytes()).hexdigest()+'\nOne A4 page, 7.2pt margins. Microsoft YaHei, gray 454545, 10pt body. Full-page blue header image preserved. Nine absolute VML text boxes. Slots 1-5 preserve personal and education data; slot 6 expand education/analysis interest; slots 7-9 rewrite project, skills, practice and strengths. Body text adjusted to 9.5pt/13.2pt leading for added content; source 10pt/17pt. Heading labels 3-5 covered by source-blue editable VML labels to match revised content. All package parts except word/document.xml preserve byte-for-byte. Reference rendered via Word PDF as bundled LibreOffice unavailable. Reference preview reference.png.\n',encoding='utf-8')
(tmp/'inventory.json').write_text(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()},indent=2),encoding='utf-8')
def box(i,lines,top=None,height=None,size=19,line=264):
 rect=root.find('.//v:rect[@id="resume_box_%d"]'%i,ns)
 if top is not None:
  import re
  rect.set('style',re.sub(r'margin-top:[^;]+',f'margin-top:{top}pt',rect.get('style')))
 if height is not None:
  import re
  rect.set('style',re.sub(r'height:[^;]+',f'height:{height}pt',rect.get('style')))
 content=rect.find('.//w:txbxContent',ns); proto=deepcopy(content[0])
 for el in list(content):content.remove(el)
 for text in lines:
  p=deepcopy(proto);p.find('.//w:spacing',ns).set('{'+ns['w']+'}line',str(line))
  r=p.find('w:r',ns);rp=r.find('w:rPr',ns)
  rp.find('w:sz',ns).set('{'+ns['w']+'}val',str(size))
  for el in list(r):
   if el is not rp:r.remove(el)
  if '｜' in text:
   E.SubElement(rp,'{'+ns['w']+'}b')
  E.SubElement(r,'{'+ns['w']+'}t').text=text
  content.append(p)
box(6,['专业方向：数据分析与应用。主修课程：数据库原理、数据结构、计算机网络、面向对象程序设计。','求职方向：用户行为与产品数据分析，关注指标定义、数据质量、趋势拆解与分析结果复核。'],top=308,height=48,size=20,line=330)
box(7,[
'装机研究所｜用户行为埋点与数据看板｜个人项目',
'• 事件设计：记录页面访问、切换及配件加入事件，保存事件 ID、时间、访客标识、页面或型号；访问事件补充设备、来源及数据来源标记。',
'• 指标与看板：按访客标识去重，以加入配置的操作次数统计选用量，以全部选用次数计算型号占比；展示近 7／30 天趋势、品类分布与型号排行。',
'• 清洗与核验：使用 Python、PostgreSQL 处理 102 个候选型号，去重新增 97 款，商品库扩充至 130 款；核对主机 120 款、外设 10 款，并检查缺失链接。',
'• 数据交付：支持按来源筛选及 CSV 导出，整理数据库关系、功能流程和验收要点，说明本机记录与访客标识的适用范围。'
],top=395,height=123)
box(8,[
'SQL：使用 JOIN、聚合、CTE 和窗口函数完成多表取数、分组 Top N 与环比分析；检查关联键、关联行数、空值及去重口径。',
'Python／Pandas：读取 CSV、处理缺失与重复、统一字段类型，使用 merge、groupby、agg、pivot_table 完成合并、汇总、透视分析及基础图表。',
'Excel／Power BI：使用 SUMIFS、COUNTIFS、IFERROR、查找函数和透视表制作报表；通过 Power Query、表关系及基础 DAX 制作看板。',
'指标分析：明确事件粒度、统计周期和分子分母，按日期、品类及来源拆解指标；练习转化、留存与 RFM 分层，整理发现及待验证假设。'
],top=543,height=103,line=250)
box(9,[
'电商经营与用户分析｜个人练习项目',
'• 多表取数：关联用户、订单、商品与明细，检查主键、缺失及重复；按支付状态筛选数据，去重统计订单，保证统计口径一致。',
'• 经营与分层：按月份、城市和品类拆解销售额、客单价及环比；依据最近购买间隔、购买频次和金额开展 RFM 用户分层练习。',
'• 可视化交付：制作 Excel 透视表、Power BI 看板和分析报告初稿，整理经营趋势、品类表现与分层结果。',
'个人优势：重视字段与统计口径记录，能整理分析发现、待验证假设与验收要点；有大模型 API 接入及结构化输出经验，能依据配件库核验推荐结果。'
],top=678,height=130)
# Cover only the raster heading words using matching native editable shapes.
bodyp=root.find('w:body/w:p',ns)
for j,(top,label) in enumerate([(374,'项目经历'),(522,'专业技能'),(652,'实践补充')]):
 r=E.SubElement(bodyp,'{'+ns['w']+'}r');pic=E.SubElement(r,'{'+ns['w']+'}pict')
 rect=E.SubElement(pic,'{'+ns['v']+'}rect',id=f'label_{j}',style=f'position:absolute;margin-left:43pt;margin-top:{top}pt;width:57pt;height:14pt;z-index:4;mso-position-horizontal-relative:page;mso-position-vertical-relative:page',fillcolor='#305B96',stroked='f')
 tx=E.SubElement(rect,'{'+ns['v']+'}textbox',inset='0,0,0,0'); c=E.SubElement(tx,'{'+ns['w']+'}txbxContent');p=E.SubElement(c,'{'+ns['w']+'}p');pp=E.SubElement(p,'{'+ns['w']+'}pPr');sp=E.SubElement(pp,'{'+ns['w']+'}spacing');sp.set('{'+ns['w']+'}line','280');sp.set('{'+ns['w']+'}lineRule','exact')
 r=E.SubElement(p,'{'+ns['w']+'}r');rp=E.SubElement(r,'{'+ns['w']+'}rPr')
 for tag,attrs in [('rFonts',{'ascii':'Microsoft YaHei','hAnsi':'Microsoft YaHei','eastAsia':'Microsoft YaHei'}),('sz',{'val':'24'}),('color',{'val':'FFFFFF'})]:
  el=E.SubElement(rp,'{'+ns['w']+'}'+tag)
  for k,v in attrs.items():el.set('{'+ns['w']+'}'+k,v)
 E.SubElement(r,'{'+ns['w']+'}t').text=label
with ZipFile(out,'w',ZIP_DEFLATED) as dest:
 for n in z.namelist():dest.writestr(n,E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True) if n=='word/document.xml' else z.read(n))
print(out)

