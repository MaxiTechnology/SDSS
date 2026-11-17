from decimal import Decimal
import pytest
from ahp import calculate,pairs


def test_consistent_reference_reciprocity_and_exact_total():
    r=calculate(['a','b','c'],{'a:b':'2','a:c':'4','b:c':'2'})
    assert r['weights']=={'a':'57.14','b':'28.57','c':'14.29'}
    assert Decimal(r['cr'])<Decimal('1e-30') and r['acceptable']
    assert sum(Decimal(v) for v in r['weights'].values())==100
    for i in range(3):
        for j in range(3): assert abs(Decimal(r['matrix'][i][j])*Decimal(r['matrix'][j][i])-1)<Decimal('1e-25')


def test_independent_inconsistent_cyclic_reference():
    # Circulant rows sum to 1+9+1/9: eigenvector is exactly equal, CR is very high.
    r=calculate(['a','b','c'],{'a:b':'9','a:c':'1/9','b:c':'9'})
    assert not r['acceptable'] and Decimal(r['cr'])>1
    assert abs(Decimal(r['lambda_max'])-(Decimal(1)+9+Decimal(1)/9))<Decimal('1e-25')
    assert r['weights']=={'a':'33.34','b':'33.33','c':'33.33'}


def test_two_criteria_reverse_equal_and_invalid_inputs():
    assert calculate(['x','y'],{'x:y':'1/4'})['weights']=={'x':'20.00','y':'80.00'}
    assert calculate(['x','y'],{'x:y':'9'})['cr']=='0'
    for values in [{},{'x:y':None},{'x:y':'0'},{'x:y':'NaN'},{'x:y':'1.5'},{'y:x':'3'}]:
        with pytest.raises(ValueError): calculate(['x','y'],values)
    ids=[str(i) for i in range(15)];r=calculate(ids,{a+':'+b:'1' for a,b in pairs(ids)})
    assert r['acceptable'] and Decimal(r['cr'])<Decimal('1e-30')
    with pytest.raises(ValueError):calculate(ids+['16'],{})


def test_unrounded_consistency_boundary():
    from ahp import acceptable
    assert acceptable(Decimal('0.10'))
    assert not acceptable(Decimal('0.100000000000000001'))


def test_ahp_pdf_records_method_and_consistency():
    from io import BytesIO
    from pypdf import PdfReader
    from test_reports import saved
    from reports import report_data,render_pdf
    row=saved();r=calculate(['price','quality'],{'price:quality':'2'})
    row['snapshot']['weight_method']='AHP pairwise weighting (approved)'
    row['snapshot']['weight_provenance']={'result':r}
    row['snapshot']['ranking']['weights']=r['weights']
    data=report_data(row)
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render_pdf(data))).pages)
    assert 'AHP consistency' in text and '66.67' in text and '33.33' in text
    assert 'CR: 0.000000' in text and 'Lambda max: 2.000000' in text
    assert '0E+' not in text
    assert data['weight_diagnostics']==r
