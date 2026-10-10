"""Il Secchione · generatore del logo V2 (solo sviluppo, non serve all'app).
Rigenera assets/brand/logo_v2*.svg: lettere dai contorni di Barlow Condensed 800 (OFL 1.1),
occhiali pixel e cervello disegnati in vettoriale. Nessun raster, nessun carattere esterno nell'SVG.
  pip install fonttools brotli
  python3 tools/brand/make_logo.py assets/fonts/barlow-condensed-latin-800-normal.woff2 assets/brand
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from glyphs import run
FONT=sys.argv[1]; OUT=sys.argv[2]
os.makedirs(OUT, exist_ok=True)
WHITE='#F5F8FF'; CYAN='#22D3F5'; NIGHT='#050B1F'; DEEP='#061238'; PINK='#FF9DC0'; PINKD='#D9578E'; INK='#0A0F1E'

def word(text,size,x,base,fill,track=4):
    d=run(FONT,text,size,track)
    paths=''.join(f'<path transform="translate({x:.1f} {base})" d="{p["d"]}"/>' for p in d['parts'] if p['d'])
    return f'<g fill="{fill}">{paths}</g>', d

def glasses(cx,cy,p,rot=-6,outline=True,fill=INK,hi=WHITE):
    # griglia pixel 24x5: barra superiore + due lenti a gradini
    cells=[(c,0) for c in range(24)]
    for a in (1,13):
        b=a+9
        for c in range(a,b+1): cells+= [(c,1),(c,2)]
        for c in range(a+1,b): cells.append((c,3))
        for c in range(a+2,b-1): cells.append((c,4))
    his=[]
    for a in (1,13): his+=[(a+6,1),(a+7,1),(a+5,2),(a+6,2)]
    w,h=24*p,5*p; ox,oy=cx-w/2,cy-h/2
    o=p*0.55
    def rp(cs,e,pad=0):  # un solo tracciato: niente fessure tra i pixel
        return ''.join(f'M{ox+c*p-pad:.2f} {oy+r*p-pad:.2f}h{p+2*pad+e:.2f}v{p+2*pad+e:.2f}h{-(p+2*pad+e):.2f}z' for c,r in cs)
    out=''
    if outline: out+=f'<path fill="{WHITE}" d="{rp(cells,.6,o)}"/>'
    out+=f'<path fill="{fill}" d="{rp(cells,.6)}"/>'
    if hi: out+=f'<path fill="{hi}" d="{rp(his,0)}"/>'
    return f'<g transform="rotate({rot} {cx} {cy})">{out}</g>'

def brain(cx,cy,s,fill=PINK,line=PINKD):
    # cervello stilizzato: due emisferi a lobi + solchi
    k=s/40
    lobes=[(-11,-4,9),(-4,-9,9),(5,-9,9),(12,-3,9),(-12,5,8),(-3,4,10),(6,4,10),(13,5,8)]
    circ=''.join(f'<circle cx="{cx+x*k:.1f}" cy="{cy+y*k:.1f}" r="{r*k:.1f}"/>' for x,y,r in lobes)
    sw=max(1.2,2.2*k)
    folds=(f'<path d="M{cx:.1f} {cy-15*k:.1f} V{cy+12*k:.1f} M{cx-14*k:.1f} {cy-1*k:.1f} q5 {-5*k:.1f} {9*k:.1f} 0 M{cx+5*k:.1f} {cy-4*k:.1f} q5 {5*k:.1f} {9*k:.1f} 0 M{cx-9*k:.1f} {cy+8*k:.1f} q4 {-4*k:.1f} {7*k:.1f} 0" fill="none" stroke="{line}" stroke-width="{sw:.1f}" stroke-linecap="round"/>')
    return f'<g fill="{fill}">{circ}</g>{folds}'

def tag(x,top,base,fill=CYAN,ink=NIGHT,brainOn=True):
    # «il» in un'etichetta inclinata più piccola della parola; il cervello (puntino della i) esce dal bordo superiore
    h=base-top; w=h*0.80; sk=h*0.18
    poly=f'<path d="M{x+sk:.1f} {top} H{x+w+sk:.1f} L{x+w:.1f} {base} H{x:.1f} Z" fill="{fill}"/>'
    sw=h*0.17; ix=x+w*0.26; lx=x+w*0.58
    def stem(xx,yt):  # asta inclinata come l'etichetta
        t=(yt-top)/h*sk
        return f'M{xx+sk-t:.1f} {yt:.1f} H{xx+sk-t+sw:.1f} L{xx+sw+h*0.1*0.18:.1f} {base-h*0.1:.1f} H{xx+h*0.1*0.18:.1f} Z'
    stems=f'<path d="{stem(ix,top+h*0.42)} {stem(lx,top+h*0.14)}" fill="{ink}"/>'
    b=brain(ix+sw*0.5+sk*0.86,top+h*0.06,h*0.62) if brainOn else ''
    return poly+stems+b, w+sk

def bar(x0,x1,y,h,fill):  # barra con taglio diagonale a destra
    return f'<path d="M{x0:.1f} {y:.1f} H{x1+h*0.6:.1f} L{x1:.1f} {y+h:.1f} H{x0:.1f} Z" fill="{fill}"/>'
def slash(x,y,h,w,fill):
    return f'<path d="M{x+h*0.6:.1f} {y:.1f} h{w:.1f} L{x+w:.1f} {y+h:.1f} h{-w:.1f} Z" fill="{fill}"/>'

def svg(w,h,body,title='Il Secchione'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'

# ---- orizzontale (core) ----
# silhouette: etichetta «il» piccola in alto + barra ciano sotto che forma una staffa a L asimmetrica,
# occhiali pixel più grandi appoggiati su «HIO», due tagli magenta/ciano a fine barra.
MAG='#FF3DC8'
def core(x0,top,mono=False,shadowOn=True):
    S=200; base=top+140
    th=92  # etichetta ≈ 2/3 dell'altezza delle maiuscole
    t,tw=tag(x0,base-th,base,fill=WHITE if mono else CYAN,ink=NIGHT,brainOn=not mono)
    if mono:
        tmask=tag(x0,base-th,base,fill='#fff',ink='#000',brainOn=False)[0]
        t=f'<defs><mask id="tk" maskUnits="userSpaceOnUse">{tmask}</mask></defs><rect x="{x0}" y="{base-th}" width="{tw+2:.0f}" height="{th}" fill="{WHITE}" mask="url(#tk)"/>'
    wx=x0+tw+16
    front,d=word('SECCHIONE',S,wx,base,WHITE)
    sh=word('SECCHIONE',S,wx+5,base+8,DEEP)[0] if shadowOn and not mono else ''
    P=d['parts']; gx0=wx+P[4]['x']; gx1=wx+P[6]['x']+P[6]['adv']
    pp=(gx1-gx0+44)/24
    lift=16 if mono else 0
    g=glasses((gx0+gx1)/2, top-4-2.5*pp-lift, pp, rot=-5, outline=not mono, fill=WHITE if mono else INK, hi=None if mono else WHITE)
    uy=base+18; uh=18
    ul=bar(x0,gx1,uy,uh,WHITE if mono else CYAN)
    sl=slash(gx1+30,uy,uh,16,WHITE if mono else MAG)+slash(gx1+58,uy,uh,16,WHITE if mono else CYAN)
    return t+sh+front+g+ul+sl, wx+d['width'], uy+uh
body,W,H=core(6,86)
open(f'{OUT}/logo_v2.svg','w').write(svg(W+14,H+8,body))
mb,_,_=core(6,86,mono=True)
open(f'{OUT}/logo_v2_mono.svg','w').write(svg(W+14,H+8,mb))
# ---- micro (solo testo, per misure piccolissime) ----
mi1,d1=word('IL',S*0.62,0,base,WHITE) if False else word('IL',124,0,212,WHITE)
mi2,d2=word('SECCHIONE',200,d1['width']+26,212,WHITE)
open(f'{OUT}/logo_v2_micro.svg','w').write(svg(d1['width']+26+d2['width']+6,222,mi1+mi2))
# ---- compatto (etichetta sopra la parola) ----
ct,ctw=tag(6,40,132)
cbase=360
c_sh,_=word('SECCHIONE',200,11,cbase+8,DEEP)
c_fr,cd=word('SECCHIONE',200,6,cbase,WHITE)
CP=cd['parts']; cg0=6+CP[4]['x']; cg1=6+CP[6]['x']+CP[6]['adv']; cp=(cg1-cg0+44)/24
cgl=glasses((cg0+cg1)/2, cbase-140-4-2.5*cp, cp, rot=-5)
cul=bar(6,cg1,cbase+18,18,CYAN)+slash(cg1+30,cbase+18,18,16,MAG)+slash(cg1+58,cbase+18,18,16,CYAN)
open(f'{OUT}/logo_v2_compact.svg','w').write(svg(6+cd['width']+14,cbase+44,ct+c_sh+c_fr+cgl+cul))
# ---- simbolo (occhiali + cervello su quadrato arrotondato) ----
sym=(f'<rect x="8" y="8" width="304" height="304" rx="64" fill="#0C2C9A" stroke="{CYAN}" stroke-width="10"/>'
     +brain(160,112,96)+glasses(160,212,11,rot=-5)+slash(222,262,16,14,MAG)+slash(244,262,16,14,CYAN))
open(f'{OUT}/logo_v2_symbol.svg','w').write(svg(320,320,sym))
print('ok',W)
