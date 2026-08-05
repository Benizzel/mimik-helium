const PREVIEW_CSS = `
  html { background: #3F3F46; }
  body {
    background: #3F3F46 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 22px 0 34px !important;
  }
  .mimik-sheets { display: flex; flex-direction: column; align-items: center; gap: 18px; }
  .mimik-sheet {
    width: 210mm;
    height: 297mm;
    background: #fff;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }
  .mimik-sheet-body {
    padding: 18.5mm 18.5mm 0;
    height: calc(297mm - 34mm);
    overflow: hidden;
  }
  .mimik-sheet-foot {
    position: absolute;
    left: 18.5mm;
    right: 18.5mm;
    bottom: 11mm;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: #6B7280;
    border-top: 1px solid #E5E7EB;
    padding-top: 7px;
  }
  .mimik-sheet-foot .mimik-page { margin-left: auto; }
  .mimik-sheet-body > *:last-child { margin-bottom: 0 !important; }
  .mimik-sheet-body section { margin-bottom: 34px !important; }
  .mimik-sheet-body header { margin-bottom: 34px !important; }
`;

export function withPreviewStyles(exportHtml: string): string {
  return exportHtml.replace('</head>', `<style id="mimik-preview">${PREVIEW_CSS}</style>\n</head>`);
}

export function paginatePreview(doc: Document): number {
  const body = doc.body;
  if (!body || body.querySelector('.mimik-sheets')) return 0;

  const blocks: HTMLElement[] = [];
  let footer: HTMLElement | null = null;

  for (const node of Array.from(body.children)) {
    if (!(node instanceof doc.defaultView!.HTMLElement)) continue;
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') continue;
    if (node.hasAttribute('data-doc-footer')) footer = node;
    else blocks.push(node);
  }

  for (const node of blocks) node.remove();
  footer?.remove();

  const stack = doc.createElement('div');
  stack.className = 'mimik-sheets';
  body.appendChild(stack);

  const bodies: HTMLElement[] = [];
  const addSheet = () => {
    const sheet = doc.createElement('div');
    sheet.className = 'mimik-sheet';
    const inner = doc.createElement('div');
    inner.className = 'mimik-sheet-body';
    sheet.appendChild(inner);
    stack.appendChild(sheet);
    bodies.push(inner);
    return inner;
  };

  let current = addSheet();
  for (const block of blocks) {
    if (block.hasAttribute('data-cover')) {
      current.appendChild(block);
      current = addSheet();
      continue;
    }
    current.appendChild(block);
    if (current.scrollHeight > current.clientHeight && current.children.length > 1) {
      current = addSheet();
      current.appendChild(block);
    }
  }

  const last = bodies[bodies.length - 1];
  if (bodies.length > 1 && last.children.length === 0) {
    last.parentElement?.remove();
    bodies.pop();
  }

  bodies.forEach((inner, index) => {
    const foot = doc.createElement('div');
    foot.className = 'mimik-sheet-foot';
    if (footer) {
      for (const span of Array.from(footer.children)) foot.appendChild(span.cloneNode(true));
    }
    const page = doc.createElement('span');
    page.className = 'mimik-page';
    page.textContent = `${index + 1} / ${bodies.length}`;
    foot.appendChild(page);
    inner.parentElement?.appendChild(foot);
  });

  return bodies.length;
}
