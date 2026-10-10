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
    o=p*0.42
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

def tag(x,top,base,fill=CYAN,ink=NIGHT,brainOn=True,knock=False):
    # «il» in un'etichetta inclinata: due aste + cervello come puntino della i
    h=base-top; w=h*0.78; sk=h*0.18
    poly=f'<path d="M{x+sk:.1f} {top} H{x+w+sk:.1f} L{x+w:.1f} {base} H{x:.1f} Z" fill="{fill}"/>'
    sw=h*0.16; ix=x+w*0.30; lx=x+w*0.60
    def stem(xx,yt):  # asta inclinata come l'etichetta
        t=(yt-top)/h*sk
        return f'M{xx+sk-t:.1f} {yt:.1f} H{xx+sk-t+sw:.1f} L{xx+sw+h*0.1*0.18:.1f} {base-h*0.1:.1f} H{xx+h*0.1*0.18:.1f} Z'
    stems=f'<path d="{stem(ix,top+h*0.45)} {stem(lx,top+h*0.14)}" fill="{ink}"/>'
    b=brain(ix+sw*0.5+sk*0.78,top+h*0.25,h*0.34) if brainOn else ''
    return poly+stems+b, w+sk

def svg(w,h,body,title='Il Secchione'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'

# ---- orizzontale (core) ----
S=200; base=212; top=base-140
t,tw=tag(6,top,base)
wx=6+tw+22
shadow,_=word('SECCHIONE',S,wx+5,base+8,DEEP)
front,d=word('SECCHIONE',S,wx,base,WHITE)
# occhiali appoggiati sopra «HIO»
P=d['parts']; gx0=wx+P[4]['x']; gx1=wx+P[6]['x']+P[6]['adv']
g=glasses((gx0+gx1)/2, top-30, (gx1-gx0+20)/24, rot=-5)
W=wx+d['width']+14
open(f'{OUT}/logo_v2.svg','w').write(svg(W,base+16,t+shadow+front+g))
# ---- monocromatico (un solo colore, «il» traforato) ----
tm,_=tag(6,top,base,fill=WHITE,ink=NIGHT,brainOn=False)
m_front,_=word('SECCHIONE',S,wx,base,WHITE)
gm=glasses((gx0+gx1)/2, top-44, (gx1-gx0+20)/24, rot=-5, outline=False, fill=WHITE, hi=None)
# traforo: aste e puntino in maschera
ix_mask=tag(6,top,base,fill='#fff',ink='#000',brainOn=False)[0]
mono=f'<defs><mask id="m" maskUnits="userSpaceOnUse"><rect width="{W:.0f}" height="{base+16}" fill="#fff"/>{ix_mask.replace("#fff","#fff")}</mask></defs>'
# semplice: etichetta bianca con aste trasparenti
tagMask=tag(6,top,base,fill='#fff',ink='#000',brainOn=False)[0]
mono=f'<defs><mask id="tagKnock" maskUnits="userSpaceOnUse">{tagMask}<circle cx="0" cy="0" r="0"/></mask></defs><rect width="{6+tw+4:.0f}" height="{base}" fill="{WHITE}" mask="url(#tagKnock)"/>'
open(f'{OUT}/logo_v2_mono.svg','w').write(svg(W,base+16,mono+m_front+gm))
# ---- micro (solo testo) ----
mi1,d1=word('IL',S*0.62,0,base,WHITE)
mi2,d2=word('SECCHIONE',S,d1['width']+26,base,WHITE)
open(f'{OUT}/logo_v2_micro.svg','w').write(svg(d1['width']+26+d2['width']+6,base+10,mi1+mi2))
# ---- compatto (etichetta sopra la parola) ----
ct,ctw=tag(6,10,120)
cbase=330
c_sh,_=word('SECCHIONE',S,11,cbase+8,DEEP)
c_fr,cd=word('SECCHIONE',S,6,cbase,WHITE)
CP=cd['parts']; cg0=6+CP[4]['x']; cg1=6+CP[6]['x']+CP[6]['adv']
cgl=glasses((cg0+cg1)/2, cbase-140-30, (cg1-cg0+20)/24, rot=-5)
open(f'{OUT}/logo_v2_compact.svg','w').write(svg(6+cd['width']+14,cbase+16,ct+c_sh+c_fr+cgl))
# ---- simbolo (occhiali + cervello su quadrato arrotondato) ----
sym=(f'<rect x="8" y="8" width="304" height="304" rx="64" fill="#0C2C9A" stroke="{CYAN}" stroke-width="10"/>'
     +brain(160,112,96)+glasses(160,212,11,rot=-5))
open(f'{OUT}/logo_v2_symbol.svg','w').write(svg(320,320,sym))
print('ok',W)
