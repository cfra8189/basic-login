(function(){
  function applyTheme(theme){
    if(theme==='dark') document.documentElement.classList.add('dark-mode');
    else document.documentElement.classList.remove('dark-mode');
  }

  document.addEventListener('DOMContentLoaded', function(){
    var toggle = document.getElementById('themeToggle');
    var saved = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(saved);
    if(toggle){
      toggle.checked = (saved==='dark');
      toggle.addEventListener('change', function(e){
        var t = e.target.checked ? 'dark' : 'light';
        applyTheme(t);
        localStorage.setItem('theme', t);
      });
    }
  });
})();
