function toggleVisibility(linkObj) {
  return dynsection.toggleVisibility(linkObj);
}
let dynsection = {
  updateStripes : function() {
    $('table.directory tr').
      removeClass('even').filter(':visible:even').addClass('even');
    $('table.directory tr').
      removeClass('odd').filter(':visible:odd').addClass('odd');
  },
  toggleVisibility : function(linkObj) {
    const base = $(linkObj).attr('id');
    const summary = $('
    const content = $('
    const trigger = $('
    const src=$(trigger).attr('src');
    if (content.is(':visible')===true) {
      content.hide();
      summary.show();
      $(linkObj).addClass('closed').removeClass('opened');
      $(trigger).attr('src',src.substring(0,src.length-8)+'closed.png');
    } else {
      content.show();
      summary.hide();
      $(linkObj).removeClass('closed').addClass('opened');
      $(trigger).attr('src',src.substring(0,src.length-10)+'open.png');
    }
    return false;
  },
  toggleLevel : function(level) {
    $('table.directory tr').each(function() {
      const l = this.id.split('_').length-1;
      const i = $('
      const a = $('
      if (l<level+1) {
        i.removeClass('iconfopen iconfclosed').addClass('iconfopen');
        a.html('&
        $(this).show();
      } else if (l==level+1) {
        i.removeClass('iconfclosed iconfopen').addClass('iconfclosed');
        a.html('&
        $(this).show();
      } else {
        $(this).hide();
      }
    });
    this.updateStripes();
  },
  toggleFolder : function(id) {
    const currentRow = $('
    const rows = currentRow.nextAll("tr");
    const re = new RegExp('^row_'+id+'\\d+_$', "i");
    const childRows = rows.filter(function() { return this.id.match(re); });
    if (childRows.filter(':first').is(':visible')===true) {
      const currentRowSpans = currentRow.find("span");
      currentRowSpans.filter(".iconfopen").removeClass("iconfopen").addClass("iconfclosed");
      currentRowSpans.filter(".arrow").html('&
      rows.filter("[id^=row_"+id+"]").hide();
    } else {
      const currentRowSpans = currentRow.find("span");
      currentRowSpans.filter(".iconfclosed").removeClass("iconfclosed").addClass("iconfopen");
      currentRowSpans.filter(".arrow").html('&
      const childRowsSpans = childRows.find("span");
      childRowsSpans.filter(".iconfopen").removeClass("iconfopen").addClass("iconfclosed");
      childRowsSpans.filter(".arrow").html('&
      childRows.show();
    }
    this.updateStripes();
  },
  toggleInherit : function(id) {
    const rows = $('tr.inherit.'+id);
    const img = $('tr.inherit_header.'+id+' img');
    const src = $(img).attr('src');
    if (rows.filter(':first').is(':visible')===true) {
      rows.css('display','none');
      $(img).attr('src',src.substring(0,src.length-8)+'closed.png');
    } else {
      rows.css('display','table-row');
      $(img).attr('src',src.substring(0,src.length-10)+'open.png');
    }
  },
};
let codefold = {
  opened : true,
  plusImg:  [ "var(--fold-plus-image)",  "var(--fold-plus-image-relpath)" ],
  minusImg: [ "var(--fold-minus-image)", "var(--fold-minus-image-relpath)" ],
  toggle_all : function(relPath) {
    if (this.opened) {
      $('
      $('div[id^=foldopen]').hide();
      $('div[id^=foldclosed]').show();
    } else {
      $('
      $('div[id^=foldopen]').show();
      $('div[id^=foldclosed]').hide();
    }
    this.opened=!this.opened;
  },
  toggle : function(id) {
    $('
    $('
  },
  init : function(relPath) {
    $('span[class=lineno]').css({
      'padding-right':'4px',
      'margin-right':'2px',
      'display':'inline-block',
      'width':'54px',
      'background':'linear-gradient(var(--fold-line-color),var(--fold-line-color)) no-repeat 46px/2px 100%'
    });
    $('span[class=lineno]:first').append('<span class="fold" id="fold_all" '+
      'onclick="javascript:codefold.toggle_all('+relPath+');" '+
      'style="background-image:'+this.minusImg[relPath]+';"></span>');
    $('span[class=lineno]').not(':eq(0)').append('<span class="fold"></span>');
    $('div[class=foldopen]').each(function() {
      const id    = $(this).attr('id').replace('foldopen','');
      const start = $(this).attr('data-start');
      const end   = $(this).attr('data-end');
      $(this).find('span[class=fold]:first').replaceWith('<span class="fold" '+
                   'onclick="javascript:codefold.toggle(\''+id+'\');" '+
                   'style="background-image:'+codefold.minusImg[relPath]+';"></span>');
      $(this).after('<div id="foldclosed'+id+'" class="foldclosed" style="display:none;"></div>');
      const line = $(this).children().first().clone();
      $(line).removeClass('glow');
      if (start) {
        $(line).html($(line).html().replace(new RegExp('\\s*'+start+'\\s*$','g'),''));
      }
      $(line).find('span[class=fold]').css('background-image',codefold.plusImg[relPath]);
      $(line).append(' '+start+'<a href="javascript:codefold.toggle(\''+id+'\')">&
      $('
    });
  },
};
