/**
 * Opens printable HTML in a new window and wires .btn-print exactly once.
 * Avoids stacked handlers (inline onclick + repeated addEventListener).
 */
export function openPrintPreviewWindow(html, { autoPrint = false } = {}) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Please allow popups to print');
    return null;
  }

  w.document.write(html);
  w.document.close();

  const attachPrintHandler = () => {
    try {
      const printBtn = w.document.querySelector('.btn-print');
      if (!printBtn || printBtn.dataset.printBound === '1') return;
      printBtn.dataset.printBound = '1';
      printBtn.addEventListener('click', (e) => {
        e.preventDefault();
        w.print();
      });
    } catch {
      // popup may already be closed
    }
  };

  if (w.document.readyState === 'complete') {
    attachPrintHandler();
  } else {
    w.addEventListener('load', attachPrintHandler, { once: true });
  }

  if (autoPrint) {
    setTimeout(() => {
      try {
        w.print();
      } catch {
        // ignore if window was closed
      }
    }, 350);
  }

  try {
    w.focus();
  } catch {
    // ignore
  }

  return w;
}
