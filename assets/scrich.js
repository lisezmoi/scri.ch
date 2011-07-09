(function(w, d){
  
  var started   = false,
      gid       = function(id){return document.getElementById(id);},
      canv      = gid("draw"),
      bsave     = gid("save"),
      bnew      = gid("new"),
      img       = gid("img"),
      form      = gid("form"),
      ndraw     = gid("new_draw"),
      about     = gid("about"),
      minWidth  = 0,
      minHeight = 0,
      drew      = false,
      ctx       = null,
      copyCanv  = d.createElement('canvas');
      copyCtx  = null;
  
  if (!canv.getContext) {
    w.alert("Your browser does not support canvas, you need to update it before using scri.ch.");
    return;
  }
  
  ctx = canv.getContext("2d");
  copyCtx = copyCanv.getContext("2d");
  
  // Webkit fix
  d.onselectstart = function(){return false;};
  
  function resizeCanvas(toWidth, toHeight) {
    
    // Save img data
    var imgData = ctx.getImageData(0, 0, canv.width, canv.height);
    
    // Resize canvas
    canv.width  = toWidth  || ((w.innerWidth > minWidth)?  w.innerWidth : minWidth);
    canv.height = toHeight || ((w.innerHeight > minHeight)?  w.innerHeight : minHeight);
    
    // Restore img data
    // ctx.putImageData(imgData, 0, 0);
    
    // Firefox fix, need to copy it to another canvas
    copyCanv.width = imgData.width;
    copyCanv.height = imgData.height;
    copyCtx.putImageData(imgData, 0, 0);
    
    ctx.drawImage(copyCanv, 0, 0);
  }
  
  function startDraw(e) {
    if (e.button === 2) { return; } // Right click
    
    var c = getCoords(e);
    drawPoint(c.x, c.y); // Draw a point on click
    
    // Prepare for line drawing
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    
    showBtns();
    
    window.addEventListener('mousemove', ev_mousemove, false);
    canv.addEventListener('touchmove', ev_mousemove, false);
  }
  
  function endDraw() {
    ctx.stroke();
    window.removeEventListener('mousemove', ev_mousemove, false);
    canv.removeEventListener('touchmove', ev_mousemove, false);
  }
  
  function drawPoint(x, y) {
    updateMinDims(x+1, y+1);
    ctx.fillStyle = "#000000";
    ctx.fillRect(x-1, y-1, 2, 2);
  }
  
  function drawLine(x, y) {
    updateMinDims(x+1, y+1);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  
  function showBtns() {
    if (!drew) {
      drew = true;
      var btns = [bsave, bnew, about];
      var preventFn = function(e){e.stopPropagation();};
      while (btns.length) {
        var btn = btns.shift();
        btn.style.display = "block";
        btn.addEventListener("mousedown", preventFn, false);
      }
    }
  }
  
  function ev_mousemove(e) {
    e.preventDefault();
    var c = getCoords(e);
    drawLine(c.x, c.y);
  }
  
  function getCoords(e) {
    return {
      x: (e.touches)? e.touches[0].pageX : e.pageX,
      y: (e.touches)? e.touches[0].pageY : e.pageY
    };
  }
  
  function updateMinDims(width, height) {
    if (width > minWidth) {
      minWidth = width;
    }
    if (height > minHeight) {
      minHeight = height;
    }
  }
  
  function start() {
    
    w.addEventListener("resize", function(){
      resizeCanvas();
    }, false);
    resizeCanvas();
    
    d.body.addEventListener("touchmove", function(e){ e.preventDefault(); }, false);
    canv.addEventListener("mousedown", startDraw, true);
    canv.addEventListener("touchstart", function(e){ e.preventDefault(); startDraw(e); }, false);
    window.addEventListener("mouseup", endDraw, false);
    canv.addEventListener("touchend", endDraw, false);
    
    bsave.onclick = function() {
      resizeCanvas(minWidth, minHeight);
      if (minWidth > 0 && minHeight > 0) {
        ndraw.value = canv.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
        form.submit();
      }
    };
    
    bnew.onclick = function() {
      window.location = window.SCRICH_URL;
    };
  }
  
  var loadImg = window.loadImg = function(src, callback) {
    var cImg = new Image();
    cImg.onload = function() {
      canv.width = minWidth = cImg.width;
      canv.height = minHeight = cImg.height;
      try {
        ctx.drawImage(cImg, 0, 0);
      } catch (err) { // Firefox 3.6 loading bug
        window.setTimeout(function(){
          loadImg(src, callback);
        }, 300);
      }
      
      if (callback) {
        callback();
      }
    };
    cImg.src = src;
  };
  
  if (img) {
    loadImg(img.src, start);
  } else {
    start();
  }
  
})(window, document);