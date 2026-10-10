"""Contact sheets from unmodified browser screenshots; only crop and label."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parent
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 25)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
crop = (184, 74, 804, 695)

def sheet(filename, title, tiles):
    image = Image.new('RGB', (1280, 1394), '#f4f5f6')
    draw = ImageDraw.Draw(image)
    draw.text((20, 8), title, font=font, fill='#243440')
    for index, (source, label) in enumerate(tiles):
        x, y = 20 + 640 * (index % 2), 46 + 674 * (index // 2)
        draw.text((x, y), label, font=small, fill='#243440')
        image.paste(Image.open(folder / source).crop(crop), (x, y + 28))
    image.save(folder / filename, quality=95)

sheet('comparison.jpg', '同一第24天：左 overhead=30，右 overhead=60；物理状态完全相同', [
    ('before-asia-day24.jpg', '亚洲与澳洲 · 调整前 · 12×'),
    ('after-asia-day24.jpg', '亚洲与澳洲 · 调整后 · 12×'),
    ('before-arctic-day24.jpg', '北极 · 调整前 · 季节23.65°'),
    ('after-arctic-day24.jpg', '北极 · 调整后 · 季节23.65°'),
])
sheet('seasonal-evidence.jpg', '正常时钟连续运行169.79天：极区与植被问题仍然存在', [
    ('final-arctic-day169.jpg', '北极 · 北半球夏季末 · 残冰不足'),
    ('final-antarctic-day169.jpg', '南极 · 南半球冬季末 · 大陆裸露'),
    ('final-andes-amazon-day169.jpg', '安第斯与亚马孙 · 雨林仍偏黄'),
    ('final-africa-europe-day169.jpg', '非洲与欧洲 · 植被带过度规则'),
])
