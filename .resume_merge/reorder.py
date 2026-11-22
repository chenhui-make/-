from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
import re
p=Path('G:/项目—装机研究所/docs/马晨辉-微派数据分析实习简历-蓝色丰富优化版.docx')
out=p.with_name('马晨辉-微派数据分析实习简历-蓝色丰富优化版-顺序调整.docx')
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','v':'urn:schemas-microsoft-com:vml'}
with ZipFile(p) as z:
 root=E.fromstring(z.read('word/document.xml'))
 for i,top,height in [(8,395,123),(9,543,103),(7,678,130)]:
  r=root.find(f'.//v:rect[@id="resume_box_{i}"]',ns)
  style=re.sub(r'margin-top:[^;]+',f'margin-top:{top}pt',r.get('style'))
  r.set('style',re.sub(r'height:[^;]+',f'height:{height}pt',style))
  if i==9:
   for s in r.findall('.//w:spacing',ns):s.set('{'+ns['w']+'}line','250')
 for i,label in enumerate(['专业技能','练习项目','个人项目']):
  root.find(f'.//v:rect[@id="label_{i}"]//w:t',ns).text=label
 # Match XML reading order to visual order.
 parent=root.find('w:body/w:p',ns)
 runs=[root.find(f'.//v:rect[@id="resume_box_{i}"]',ns).getparent().getparent() for i in [7,8,9]]
 idx=list(parent).index(runs[0])
 for r in runs:parent.remove(r)
 for offset,r in enumerate([runs[1],runs[2],runs[0]]):parent.insert(idx+offset,r)
 with ZipFile(out,'w',ZIP_DEFLATED) as dest:
  for n in z.namelist():dest.writestr(n,E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True) if n=='word/document.xml' else z.read(n))
print('Saved')
