// ANIMACIÓN SCROLL
const elements = document.querySelectorAll('.fade-in');

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('show');
        }
    });
}, {
    threshold: 0.2
});

elements.forEach(el => observer.observe(el));


// EFECTO NAVBAR AL SCROLL
window.addEventListener("scroll", () => {
    const header = document.querySelector(".header");

    if (window.scrollY > 50) {
        header.style.background = "rgba(0,0,0,0.9)";
    } else {
        header.style.background = "rgba(15,15,15,0.7)";
    }
});


// BOTONES SUAVES (SCROLL)
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute("href"))
            .scrollIntoView({ behavior: "smooth" });
    });
});


// EFECTO HOVER DINÁMICO EN CARDS
document.querySelectorAll(".card").forEach(card => {
    card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        card.style.transform = `rotateX(${(y - rect.height/2)/10}deg) rotateY(${(x - rect.width/2)/10}deg)`;
    });

    card.addEventListener("mouseleave", () => {
        card.style.transform = "rotateX(0) rotateY(0)";
    });
});


const observer = new IntersectionObserver(entries=>{

entries.forEach(entry=>{

if(entry.isIntersecting){
entry.target.classList.add('show');
}

});

});

document.querySelectorAll('.hidden').forEach(el=>{
observer.observe(el);
});

function closeAd(){
document.getElementById('floatingAd').style.display='none';
}

