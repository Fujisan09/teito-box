# テスト用画像を生成する（Pillow と pillow-heif が必要）
from PIL import Image, ImageDraw, ImageFont
import os
def mk(name,w,h,label):
    im=Image.new("RGB",(w,h),(200,215,235)); d=ImageDraw.Draw(im); bw=max(16,w//80)
    d.rectangle([0,0,w-1,h-1],outline=(200,30,30),width=bw); d.rectangle([0,0,w-1,bw//2],fill=(0,160,0)); d.rectangle([0,h-1-bw//2,w-1,h-1],fill=(0,0,200))
    f=ImageFont.load_default(); d.text((bw*2,bw*2),"L-TOP",fill=(0,0,0),font=f); d.text((w-bw*2-60,h-bw*2-20),"R-BTM",fill=(0,0,0),font=f); d.text((w//2-40,h//2),label,fill=(20,60,160),font=f)
    d.rectangle([bw*2,int(h*0.42),w-bw*2,int(h*0.58)],fill=(90,90,90)); im.save(name,"JPEG",quality=90)
mk("land.jpg",4032,3024,"LANDSCAPE"); mk("port.jpg",3024,4032,"PORTRAIT"); mk("sq.jpg",2000,2000,"SQUARE"); mk("wide.jpg",4000,1500,"PANORAMA")
im=Image.effect_noise((4032,3024),80).convert("RGB"); ImageDraw.Draw(im).rectangle([0,0,4031,3023],outline=(200,30,30),width=50); im.save("noisy.jpg","JPEG",quality=90)
base=Image.open("land.jpg").convert("RGB"); base.save("f.png"); base.save("f.webp",quality=85); base.convert("P").save("f.gif"); base.save("f.bmp"); base.save("f.tif")
t=Image.new("RGBA",(800,600),(0,0,0,0)); ImageDraw.Draw(t).rectangle([100,100,700,500],fill=(200,30,30,255)); t.save("f_alpha.png")
try:
    import pillow_heif; pillow_heif.register_heif_opener(); base.save("f.heic",quality=85)
except Exception as e: print("HEIC skipped:",e)
