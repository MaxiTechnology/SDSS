import json
from decimal import Decimal
import pytest
from ai_weighting import parse_suggestion,input_context,generate_suggestion
from cloudflare_ai import AIConnectionError


def valid():return {'weights':{'price':60,'quality':40},'rationales':{'price':'Cost is important.','quality':'Quality remains necessary.'},'summary':'Balance cost and quality.'}


def test_strict_schema_ids_ranges_total_and_explanations():
    result=parse_suggestion(json.dumps(valid()),['price','quality'])
    assert result['weights']=={'price':'60.00','quality':'40.00'}
    for change in [{'weights':{'price':60,'unknown':40}}, {'weights':{'price':60,'quality':39}}, {'weights':{'price':'NaN','quality':40}}, {'weights':{'price':'60.001','quality':'39.999'}}, {'rationales':{'price':'','quality':'Fine'}}, {'summary':'  '}, {'extra':'unexpected'}]:
        with pytest.raises(AIConnectionError):parse_suggestion(json.dumps({**valid(),**change}),['price','quality'])
    with pytest.raises(AIConnectionError):parse_suggestion('```json\n'+json.dumps(valid())+'\n```',['price','quality'])
    with pytest.raises(AIConnectionError):parse_suggestion('{"weights":{"price":60,"price":50,"quality":40},"rationales":{},"summary":"x"}',['price','quality'])


def test_context_allowlist_and_provider_prompt(monkeypatch):
    import ai_weighting,cloudflare_ai
    criteria=[{'id':'price','name':'Cost','unit':'USD','direction':'cost','selected':True,'supplier_evidence':'DO NOT SEND'},{'id':'quality','name':'Quality','unit':'points','direction':'benefit'}]
    context=input_context('IT',criteria)
    assert set(context)=={'category','criteria'} and 'DO NOT SEND' not in json.dumps(context)
    monkeypatch.setattr(cloudflare_ai,'settings',lambda:{'private':'not exposed'})
    def call(config,messages,max_tokens):
        assert max_tokens==2500 and 'DO NOT SEND' not in json.dumps(messages)
        assert json.loads(messages[1]['content'])['purchasing_priorities']=='Cost first'
        return json.dumps(valid())
    monkeypatch.setattr(cloudflare_ai,'generate',call)
    assert generate_suggestion(context,'Cost first')['weights']['price']=='60.00'


def test_ai_provenance_in_pdf():
    from test_reports import saved
    from reports import report_data,render_pdf
    from pypdf import PdfReader
    from io import BytesIO
    row=saved();s={'provider':'Cloudflare Workers AI','model':'test-model','priorities':'Balance cost and quality',**parse_suggestion(json.dumps(valid()),['price','quality'])}
    row['snapshot']['weight_method']='AI-assisted weighting (approved)'
    row['snapshot']['weight_provenance']={'suggestion':s,'notes':'Adjusted after review'}
    report=report_data(row);text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render_pdf(report))).pages)
    assert 'AI assistance - reviewed by a human' in text and 'test-model' in text
    assert 'Original AI weight: 60.00%' in text and 'Approved weight: 50%' in text
    assert 'Adjusted after review' in text
