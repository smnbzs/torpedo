let clipboard_title = "Copy to clipboard"
let clipboard_icon = `<svg xmlns="http:
let clipboard_successIcon = `<svg xmlns="http:
let clipboard_successDuration = 1000
$(function() {
  if(navigator.clipboard) {
    const fragments = document.getElementsByClassName("fragment")
    for(const fragment of fragments) {
      const clipboard_div = document.createElement("div")
      clipboard_div.classList.add("clipboard")
      clipboard_div.innerHTML = clipboard_icon
      clipboard_div.title = clipboard_title
      $(clipboard_div).click(function() {
        const content = this.parentNode.cloneNode(true)
        content.querySelectorAll(".lineno, .ttc, .foldclosed").forEach((node) => { node.remove() })
        let text = content.textContent
        text = text.replace(/^\s*\n/gm,'\n').replace(/\n*$/,'')
        navigator.clipboard.writeText(text);
        this.classList.add("success")
        this.innerHTML = clipboard_successIcon
        window.setTimeout(() => {
            this.classList.remove("success")
            this.innerHTML = clipboard_icon
        }, clipboard_successDuration);
      })
      fragment.insertBefore(clipboard_div, fragment.firstChild)
    }
  }
})
