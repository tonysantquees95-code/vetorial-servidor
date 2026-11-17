const el=document.querySelectorAll(".rev");
if(!("IntersectionObserver" in window)){el.forEach(e=>e.classList.add("v"))}
else{const o=new IntersectionObserver(l=>l.forEach(x=>{if(x.isIntersecting){x.target.classList.add("v");o.unobserve(x.target)}}),{threshold:.15});el.forEach(e=>o.observe(e))}
