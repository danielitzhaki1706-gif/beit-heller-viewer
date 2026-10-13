
    document.addEventListener('DOMContentLoaded', function () {
      var toggleButtons = document.querySelectorAll('.toggle-btn');
      toggleButtons.forEach(function (button) {
        button.setAttribute('aria-pressed',String(button.classList.contains('active')));
        button.addEventListener('click', function () {
          var container = button.closest('.toggle-controls');
          if (!container) return;
          var targetId = container.getAttribute('data-target');
          var grid = document.getElementById(targetId);
          var viewMode = button.getAttribute('data-view');

          container.querySelectorAll('.toggle-btn').forEach(function (btn) {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed','false');
          });
          button.classList.add('active');
          button.setAttribute('aria-pressed','true');

          if (grid) {
            grid.classList.remove('view-before', 'view-after', 'view-both');
            if (viewMode === 'before') {
              grid.classList.add('view-before');
            } else if (viewMode === 'after') {
              grid.classList.add('view-after');
            } else {
              grid.classList.add('view-both');
            }
          }
        });
      });
    });
