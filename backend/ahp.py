"""Reciprocal Saaty-scale AHP, principal eigenvector, and explicit CR policy."""
from decimal import Decimal, localcontext, ROUND_FLOOR

RI = {2:'0',3:'0.58',4:'0.90',5:'1.12',6:'1.24',7:'1.32',8:'1.41',9:'1.45',10:'1.49',11:'1.51',12:'1.48',13:'1.56',14:'1.57',15:'1.59'}
SCALE = {str(n) for n in range(1,10)} | {f'1/{n}' for n in range(2,10)}
METHOD = 'AHP principal eigenvector v1; Saaty 1-9 reciprocal scale; CR <= 0.10'


def acceptable(cr):
    return cr <= Decimal('0.10')


def pairs(ids):
    return [(a,b) for i,a in enumerate(ids) for b in ids[i+1:]]


def calculate(ids, judgments):
    n=len(ids)
    if n not in RI: raise ValueError('AHP supports 2 to 15 scoring criteria. Use manual weighting for larger sets.')
    keys={a+':'+b for a,b in pairs(ids)}
    if set(judgments)!=keys or any(v not in SCALE for v in judgments.values()):
        raise ValueError('Complete every comparison using the 1-9 scale or its reciprocal.')
    with localcontext() as ctx:
        ctx.prec=50
        matrix=[[Decimal(1) for _ in ids] for _ in ids]
        for i,a in enumerate(ids):
            for j in range(i+1,n):
                code=judgments[a+':'+ids[j]]
                value=Decimal(1)/Decimal(code[2:]) if code.startswith('1/') else Decimal(code)
                matrix[i][j]=value;matrix[j][i]=1/value
        w=[Decimal(1)/n]*n
        for _ in range(10000):
            aw=[sum(matrix[i][j]*w[j] for j in range(n)) for i in range(n)]
            total=sum(aw);new=[v/total for v in aw]
            delta=max(abs(new[i]-w[i]) for i in range(n));w=new
            if delta<Decimal('1e-35'): break
        else: raise ValueError('AHP calculation did not converge. Review comparisons.')
        aw=[sum(matrix[i][j]*w[j] for j in range(n)) for i in range(n)]
        eigen=sum(aw[i]/w[i] for i in range(n))/n
        ci=max(Decimal(0),(eigen-n)/(n-1));ri=Decimal(RI[n]);cr=ci/ri if ri else Decimal(0)
        # Largest-remainder allocation preserves an exact 100.00% total.
        units=[int((v*10000).to_integral_value(rounding=ROUND_FLOOR)) for v in w]
        order=sorted(range(n),key=lambda i:(-(w[i]*10000-units[i]).quantize(Decimal('1e-25')),i))
        for i in order[:10000-sum(units)]: units[i]+=1
        return {'method':METHOD,'weights':{cid:format(Decimal(units[i])/100,'.2f') for i,cid in enumerate(ids)},
                'priorities':{cid:str(w[i]) for i,cid in enumerate(ids)},'matrix':[[str(v) for v in row] for row in matrix],
                'lambda_max':str(eigen),'ci':str(ci),'ri':str(ri),'cr':str(cr),'acceptable':acceptable(cr)}
