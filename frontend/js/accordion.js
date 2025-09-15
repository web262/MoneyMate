// Simple accordion for FAQ
document.querySelectorAll('.accordion-header').forEach(btn => {
  btn.addEventListener('click', () => {
    const body = btn.nextElementSibling;
    const open = body.style.maxHeight && body.style.maxHeight !== '0px';
    document.querySelectorAll('.accordion-body').forEach(b => b.style.maxHeight = 0);
    if (!open) {
      body.style.maxHeight = body.scrollHeight + 'px';
    }
  });
});
