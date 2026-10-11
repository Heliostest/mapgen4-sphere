"""Crop and arrange genuine screenshots for evidence reading, never repaint pixels.
Raw full-viewport JPEGs remain beside these labelled thumbnails.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, hashlib
folder=Path(__file__).parent
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',20)
crop=(515,74,1520,1080)
def sheet(filename,rows,columns):
    size=440; label=38
    canvas=Image.new('RGB',(size*len(columns),(size+label)*len(rows)), '#f4f5f6')
    draw=ImageDraw.Draw(canvas); sources=[]
    for r,(name,prefix) in enumerate(rows):
        for c,(title,suffix) in enumerate(columns):
            path=folder/(prefix+suffix+'.jpg')
            raw=Image.open(path)
            assert raw.size==(2327,1105), (path,raw.size)
            thumb=raw.crop(crop).resize((size,size),Image.Resampling.LANCZOS)
            canvas.paste(thumb,(c*size,r*(size+label)+label))
            draw.text((c*size+8,r*(size+label)+6),name+' · '+title,font=font,fill='#243440')
            sources.append({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    canvas.save(folder/filename,quality=92)
    return {'file':filename,'crop':crop,'thumbnailPixels':size,'operations':'crop, downsample, arrange and add labels only','sources':sources}
records=[]
records.append(sheet('formal-polar-contact.jpg',[('北极','formal-arctic-'),('南极','formal-antarctica-'),('格陵兰','formal-greenland-')],[('初始','day0'),('24天','day24'),('北夏末','day180'),('北冬末','day365')]))
records.append(sheet('formal-regional-contact.jpg',[('非洲/欧亚','formal-africa-'),('安第斯/亚马孙','formal-americas-'),('青藏/喜马拉雅','formal-tibet-'),('澳洲','formal-australia-'),('中亚闭流','formal-central-asia-')],[('初始','day0'),('24天','day24'),('北夏末','day180'),('北冬末','day365')]))
records.append(sheet('refinement-day24-contact.jpg',[('青藏/喜马拉雅','')],[('classic','formal-tibet-day24'),('balanced','experiment-balanced-tibet-day24'),('high','experiment-high-tibet-day24')]))
records.append(sheet('short-rain-contact.jpg',[('同初态2天雨率','')],[('classic关','short-classic-off-rain-day2'),('classic开','short-classic-on-rain-day2'),('均衡关','short-balanced-off-rain-day2'),('均衡开','short-balanced-on-rain-day2')]))
(folder/'contact-sheet-provenance.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Wrote',len(records),'labelled contact sheets from raw screenshots')
