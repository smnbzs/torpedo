function initResizable(treeview) {
  let sidenav,navtree,content,header,footer,barWidth=6;
  const RESIZE_COOKIE_NAME = ''+'width';
  function resizeWidth() {
    const sidenavWidth = $(sidenav).outerWidth();
    content.css({marginLeft:parseInt(sidenavWidth)+"px"});
    if (typeof page_layout!=='undefined' && page_layout==1) {
      footer.css({marginLeft:parseInt(sidenavWidth)+"px"});
    }
    Cookie.writeSetting(RESIZE_COOKIE_NAME,sidenavWidth-barWidth);
  }
  function restoreWidth(navWidth) {
    content.css({marginLeft:parseInt(navWidth)+barWidth+"px"});
    if (typeof page_layout!=='undefined' && page_layout==1) {
      footer.css({marginLeft:parseInt(navWidth)+barWidth+"px"});
    }
    sidenav.css({width:navWidth + "px"});
  }
  function resizeHeight(treeview) {
    const headerHeight = header.outerHeight();
    const windowHeight = $(window).height();
    let contentHeight;
    if (treeview)
    {
      const footerHeight = footer.outerHeight();
      let navtreeHeight,sideNavHeight;
      if (typeof page_layout==='undefined' || page_layout==0) { 
        contentHeight = windowHeight - headerHeight - footerHeight;
        navtreeHeight = contentHeight;
        sideNavHeight = contentHeight;
      } else if (page_layout==1) { 
        contentHeight = windowHeight - footerHeight;
        navtreeHeight = windowHeight - headerHeight;
        sideNavHeight = windowHeight;
      }
      navtree.css({height:navtreeHeight + "px"});
      sidenav.css({height:sideNavHeight + "px"});
    }
    else
    {
      contentHeight = windowHeight - headerHeight;
    }
    content.css({height:contentHeight + "px"});
    if (location.hash.slice(1)) {
      (document.getElementById(location.hash.slice(1))||document.body).scrollIntoView();
    }
  }
  function collapseExpand() {
    let newWidth;
    if (sidenav.width()>0) {
      newWidth=0;
    } else {
      const width = Cookie.readSetting(RESIZE_COOKIE_NAME,250);
      newWidth = (width>250 && width<$(window).width()) ? width : 250;
    }
    restoreWidth(newWidth);
    const sidenavWidth = $(sidenav).outerWidth();
    Cookie.writeSetting(RESIZE_COOKIE_NAME,sidenavWidth-barWidth);
  }
  header  = $("
  content = $("
  footer  = $("
  sidenav = $("
  if (!treeview) {
  } else {
    navtree = $("
    $(".side-nav-resizable").resizable({resize: function(e, ui) { resizeWidth(); } });
    $(sidenav).resizable({ minWidth: 0 });
  }
  $(window).resize(function() { resizeHeight(treeview); });
  if (treeview)
  {
    const device = navigator.userAgent.toLowerCase();
    const touch_device = device.match(/(iphone|ipod|ipad|android)/);
    if (touch_device) { 
      $(sidenav).css({ paddingRight:'20px' });
      $('.ui-resizable-e').css({ width:'20px' });
      $('
      barWidth=20;
    }
    const width = Cookie.readSetting(RESIZE_COOKIE_NAME,250);
    if (width) { restoreWidth(width); } else { resizeWidth(); }
  }
  resizeHeight(treeview);
  const url = location.href;
  const i=url.indexOf("
  if (i>=0) window.location.hash=url.substr(i);
  const _preventDefault = function(evt) { evt.preventDefault(); };
  if (treeview)
  {
    $("
    $(".ui-resizable-handle").dblclick(collapseExpand);
    $("body").css({overflow: "hidden"});
  }
  $(window).on('load',function() { resizeHeight(treeview); });
}
