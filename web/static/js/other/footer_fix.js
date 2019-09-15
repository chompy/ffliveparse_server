function fflpFixFooter()
{
    var body = document.body,
        html = document.documentElement
    ;
    var height = Math.max( body.scrollHeight, body.offsetHeight, 
        html.clientHeight, html.scrollHeight, html.offsetHeight )
    ;
    var footerElement = document.getElementById("footer");
    footerElement.style.position = "";
    if (window.innerHeight < height) {
        footerElement.style.position = "relative";
    }
}
window.addEventListener("load", fflpFixFooter);
window.addEventListener("resize", fflpFixFooter);
setInterval(fflpFixFooter, 1000);