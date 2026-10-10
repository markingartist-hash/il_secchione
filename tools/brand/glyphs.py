import sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
def run(fontfile, text, size, track=0):
    f=TTFont(fontfile); gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm
    s=size/upm; x=0; parts=[]; hhea=f['hhea']
    for ch in text:
        g=cmap[ord(ch)]; pen=SVGPathPen(gs)
        tp=TransformPen(pen,(s,0,0,-s,x,0)); gs[g].draw(tp)
        parts.append({'ch':ch,'d':pen.getCommands(),'x':x,'adv':gs[g].width*s})
        x+=gs[g].width*s+track
    os2=f['OS/2']
    return {'parts':parts,'width':x-track,'cap':os2.sCapHeight*s,'xh':os2.sxHeight*s}
if __name__=='__main__':
    print(json.dumps(run(sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4]) if len(sys.argv)>4 else 0)))
