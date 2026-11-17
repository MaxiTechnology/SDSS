"""Vector-normalized TOPSIS; retain 50-digit Decimal precision until display."""
from decimal import Decimal, localcontext


def calculate(entries, suppliers, criteria, weights):
    with localcontext() as ctx:
        ctx.prec = 50
        normalized = {s['id']: {} for s in suppliers}
        weighted = {s['id']: {} for s in suppliers}
        best, worst = {}, {}
        for c in criteria:
            cid = c['id']
            values = {s['id']: Decimal(str(entries[s['id']][cid])) for s in suppliers}
            norm = sum(v*v for v in values.values()).sqrt()
            if norm == 0:
                raise ValueError(f"{c['name']} contains only zero values. Review this criterion before calculating.")
            for sid, value in values.items():
                normalized[sid][cid] = value / norm
                weighted[sid][cid] = normalized[sid][cid] * Decimal(str(weights[cid])) / 100
            column = [v[cid] for v in weighted.values()]
            best[cid], worst[cid] = (min(column), max(column)) if c['direction'] == 'cost' else (max(column), min(column))
        rows = []
        for s in suppliers:
            plus = sum((weighted[s['id']][c['id']]-best[c['id']])**2 for c in criteria).sqrt()
            minus = sum((weighted[s['id']][c['id']]-worst[c['id']])**2 for c in criteria).sqrt()
            if plus + minus == 0:
                raise ValueError('The weighted values do not distinguish suppliers. Review the criteria, values and weights.')
            rows.append({**s, 'score': minus/(plus+minus), 'distance_best': plus, 'distance_worst': minus})
        rows.sort(key=lambda r: (-r['score'], r['id']))
        for i, row in enumerate(rows):
            row['rank'] = rows[i-1]['rank'] if i and row['score'] == rows[i-1]['score'] else i+1
        def encode(value):
            if isinstance(value, Decimal): return str(value)
            if isinstance(value, dict): return {k:encode(v) for k,v in value.items()}
            if isinstance(value, list): return [encode(v) for v in value]
            return value
        return encode({'rows': rows, 'normalized': normalized, 'weighted': weighted, 'ideal_best': best, 'ideal_worst': worst})
