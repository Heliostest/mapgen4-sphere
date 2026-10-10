"""Crop and label original browser screenshots; never retouch their pixels."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parent
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 25)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
crop = (184, 74, 804, 695)

def sheet(filename, title, regions):
    image = Image.new('RGB', (1280, 1394), '#f4f5f6')
    draw = ImageDraw.Draw(image)
    draw.text((20, 8), title, font=font, fill='#243440')
    for row, (region, label) in enumerate(regions):
        for col, (phase, text) in enumerate([('before', '修正前'), ('after', '修正后')]):
            x, y = 20 + 640 * col, 46 + 674 * row
            draw.text((x, y), f'{label} · {text} · 第0天', font=small, fill='#243440')
            source = Image.open(folder / f'{phase}-{region}-day0.jpg')
            assert source.size == (1280, 720)
            image.paste(source.crop(crop), (x, y + 28))
    image.save(folder / filename, quality=95)

sheet('comparison.jpg', '同存档、镜头和参数：海面法线与可见表面描边高度', [('arctic', '北极海冰'), ('asia', '亚洲与澳洲')])
sheet('comparison-south-pacific.jpg', '同为第0天春分：overhead 60 / 起伏12× / 描边3', [('antarctic', '南极大陆与海冰'), ('pacific', '太平洋水面')])
