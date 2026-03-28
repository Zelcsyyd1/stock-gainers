from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import requests
from datetime import datetime
import pytz

app = Flask(__name__)
CORS(app)

BEIJING_TZ = pytz.timezone('Asia/Shanghai')

def get_beijing_time():
    return datetime.now(BEIJING_TZ)

def is_market_open():
    now = get_beijing_time()
    if now.weekday() >= 5:
        return False
    t = now.time()
    from datetime import time
    return (time(9, 30) <= t <= time(11, 30)) or (time(13, 0) <= t <= time(15, 0))

def get_market_status():
    now = get_beijing_time()
    if now.weekday() >= 5:
        return "休市（周末）"
    from datetime import time
    t = now.time()
    if t < time(9, 30):
        return "盘前"
    elif time(9, 30) <= t <= time(11, 30):
        return "上午交易中"
    elif time(11, 30) < t < time(13, 0):
        return "午间休市"
    elif time(13, 0) <= t <= time(15, 0):
        return "下午交易中"
    else:
        return "已收盘"

FS_MAP = {
    'all':      'm:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23',
    'shanghai': 'm:0+t:6',
    'shenzhen': 'm:1+t:2',
    'chinext':  'm:1+t:23',
    'star':     'm:0+t:13',
}

def fetch_top_gainers(page=1, page_size=50, board='all'):
    fs = FS_MAP.get(board, FS_MAP['all'])
    url = 'https://push2.eastmoney.com/api/qt/clist/get'
    params = {
        'pn': page,
        'pz': page_size,
        'po': 1,
        'np': 1,
        'ut': 'bd1d9ddb04089700cf9c27f6f7426281',
        'fltt': 2,
        'invt': 2,
        'fid': 'f3',
        'fs': fs,
        'fields': 'f2,f3,f4,f5,f6,f9,f12,f13,f14,f15,f16,f17,f18',
        '_': int(datetime.now().timestamp() * 1000),
    }
    headers = {
        'Referer': 'https://www.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }

    resp = requests.get(url, params=params, headers=headers, timeout=10)
    raw = resp.json()

    stocks = []
    diff = (raw.get('data') or {}).get('diff') or []
    for item in diff:
        change_pct = item.get('f3', 0)
        # Skip invalid data
        if change_pct == '-' or change_pct is None:
            continue
        market_id = item.get('f13', 0)
        code = item.get('f12', '')
        stocks.append({
            'code': code,
            'name': item.get('f14', ''),
            'price': item.get('f2', 0),
            'change_pct': change_pct,
            'change': item.get('f4', 0),
            'volume': item.get('f5', 0),
            'turnover': item.get('f6', 0),
            'high': item.get('f15', 0),
            'low': item.get('f16', 0),
            'open': item.get('f17', 0),
            'prev_close': item.get('f18', 0),
            'pe': item.get('f9', 0),
            'market': 'SH' if market_id == 1 else 'SZ',
        })
    return stocks

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stocks')
def api_stocks():
    board = request.args.get('board', 'all')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('size', 50))
    try:
        stocks = fetch_top_gainers(page=page, page_size=page_size, board=board)
        now = get_beijing_time()
        return jsonify({
            'success': True,
            'data': stocks,
            'market_open': is_market_open(),
            'market_status': get_market_status(),
            'time': now.strftime('%Y-%m-%d %H:%M:%S'),
            'total': len(stocks),
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'data': []})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
