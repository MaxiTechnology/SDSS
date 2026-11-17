from decimal import Decimal
import pytest
from topsis import calculate

S=[{'id':'a','name':'A'},{'id':'b','name':'B'},{'id':'c','name':'C'}]
C=[{'id':'x','name':'X','direction':'benefit'},{'id':'y','name':'Y','direction':'cost'}]

def test_worked_symmetric_example():
    # Both columns have norm sqrt(14); ideals at (3,1) and (1,3).
    r=calculate({'a':{'x':3,'y':1},'b':{'x':2,'y':2},'c':{'x':1,'y':3}},S,C,{'x':50,'y':50})
    assert [Decimal(row['score']) for row in r['rows']]==[1,Decimal('.5'),0]
    assert [row['rank'] for row in r['rows']]==[1,2,3]
    C2=[dict(c,direction='cost' if c['direction']=='benefit' else 'benefit') for c in C]
    assert calculate({'a':{'x':3,'y':1},'b':{'x':2,'y':2},'c':{'x':1,'y':3}},S,C2,{'x':50,'y':50})['rows'][0]['id']=='c'

def test_ties_zero_weights_and_degenerate_cases():
    entries={'a':{'x':3,'y':1},'b':{'x':3,'y':1},'c':{'x':1,'y':1}}
    r=calculate(entries,S,C,{'x':100,'y':0})
    assert [row['rank'] for row in r['rows']]==[1,1,3]
    with pytest.raises(ValueError,match='only zero'):
        calculate({s['id']:{'x':0,'y':1} for s in S},S,C,{'x':50,'y':50})
    with pytest.raises(ValueError,match='do not distinguish'):
        calculate({s['id']:{'x':1,'y':1} for s in S},S,C,{'x':50,'y':50})

def test_scale_invariance():
    a={'a':{'x':2,'y':10},'b':{'x':5,'y':20},'c':{'x':7,'y':30}}
    b={sid:{'x':v['x']*1000,'y':v['y']} for sid,v in a.items()}
    assert calculate(a,S,C,{'x':25,'y':75})==calculate(b,S,C,{'x':25,'y':75})
