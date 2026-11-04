#!/usr/bin/env python3
# Gộp index.html + toàn bộ js/*.js thành 1 file duy nhất (dist/index-single.html) để đưa lên host dạng 1 file.
# Chạy: python3 tools/bundle.py   (đứng ở thư mục trading-tool)
import re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(root, 'index.html'), encoding='utf8').read()
def inline(m):
    js = open(os.path.join(root, m.group(1)), encoding='utf8').read()
    assert '</script' not in js.lower(), 'File ' + m.group(1) + ' chứa </script'
    return '<script>\n' + js.rstrip('\n') + '\n</script>'
out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist', 'index-single.html'), 'w', encoding='utf8').write(out)
print('Đã tạo dist/index-single.html', len(out) // 1024, 'KB')
