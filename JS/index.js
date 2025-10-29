// Three.js Scene Setup for Hero Canvas
function initHeroCanvas() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x1a202c, 1);
    camera.position.z = 5;

    // Create a stylized 3D scanner representation
    const group = new THREE.Group();

    // Create main cube
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4a90e2, linewidth: 2 });
    const cube = new THREE.LineSegments(edges, lineMaterial);
    group.add(cube);

    // Add corner spheres
    const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x2d70b3 });
    
    const corners = [
        [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]
    ];
    
    corners.forEach(pos => {
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(...pos);
        group.add(sphere);
    });

    // Add rotating inner geometry
    const innerGeometry = new THREE.TorusKnotGeometry(0.8, 0.2, 100, 16);
    const innerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x4a90e2,
        wireframe: true 
    });
    const torusKnot = new THREE.Mesh(innerGeometry, innerMaterial);
    group.add(torusKnot);

    scene.add(group);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x4a90e2, 1, 100);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Animation
    let animationId;
    function animate() {
        animationId = requestAnimationFrame(animate);
        
        group.rotation.x += 0.005;
        group.rotation.y += 0.01;
        torusKnot.rotation.x += 0.02;
        torusKnot.rotation.y += 0.01;
        
        renderer.render(scene, camera);
    }
    animate();

    // Mark canvas as loaded
    canvas.classList.add('loaded');

    // Handle window resize
    function handleResize() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        renderer.dispose();
    };
}

// Three.js Scene Setup for Demo Canvas (Interactive)
function initDemoCanvas() {
    const canvas = document.getElementById('demoCanvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x1a202c, 1);
    camera.position.z = 8;

    // Create a more complex 3D model
    const group = new THREE.Group();

    // Create main geometry - a scanned object representation
    const mainGeometry = new THREE.DodecahedronGeometry(2, 0);
    const mainMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2d70b3,
        flatShading: true,
        shininess: 100
    });
    const mainMesh = new THREE.Mesh(mainGeometry, mainMaterial);
    group.add(mainMesh);

    // Add wireframe overlay
    const wireframeGeometry = new THREE.DodecahedronGeometry(2.05, 0);
    const wireframeEdges = new THREE.EdgesGeometry(wireframeGeometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({ 
        color: 0x4a90e2,
        linewidth: 1
    });
    const wireframe = new THREE.LineSegments(wireframeEdges, wireframeMaterial);
    group.add(wireframe);

    // Add scan points (point cloud simulation)
    const pointsGeometry = new THREE.BufferGeometry();
    const pointsCount = 500;
    const positions = new Float32Array(pointsCount * 3);
    
    for (let i = 0; i < pointsCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 8;
    }
    
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pointsMaterial = new THREE.PointsMaterial({ 
        color: 0x4a90e2, 
        size: 0.05,
        transparent: true,
        opacity: 0.6
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    group.add(points);

    scene.add(group);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x4a90e2, 1, 100);
    pointLight.position.set(-5, 5, 5);
    scene.add(pointLight);

    // Mouse interaction
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let rotation = { x: 0, y: 0 };
    let targetRotation = { x: 0, y: 0 };
    let autoRotate = true;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        autoRotate = false;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            targetRotation.y += deltaX * 0.01;
            targetRotation.x += deltaY * 0.01;
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    // Touch events for mobile
    let touchStartPos = { x: 0, y: 0 };

    canvas.addEventListener('touchstart', (e) => {
        isDragging = true;
        autoRotate = false;
        const touch = e.touches[0];
        touchStartPos = { x: touch.clientX, y: touch.clientY };
        previousMousePosition = touchStartPos;
    });

    canvas.addEventListener('touchmove', (e) => {
        if (isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = touch.clientX - previousMousePosition.x;
            const deltaY = touch.clientY - previousMousePosition.y;
            
            targetRotation.y += deltaX * 0.01;
            targetRotation.x += deltaY * 0.01;
            
            previousMousePosition = { x: touch.clientX, y: touch.clientY };
        }
    });

    canvas.addEventListener('touchend', () => {
        isDragging = false;
    });

    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.01;
        camera.position.z = Math.max(4, Math.min(15, camera.position.z));
    });

    // Animation
    let animationId;
    function animate() {
        animationId = requestAnimationFrame(animate);
        
        if (autoRotate) {
            targetRotation.y += 0.005;
        }
        
        // Smooth rotation interpolation
        rotation.x += (targetRotation.x - rotation.x) * 0.1;
        rotation.y += (targetRotation.y - rotation.y) * 0.1;
        
        group.rotation.x = rotation.x;
        group.rotation.y = rotation.y;
        
        // Animate point cloud
        points.rotation.y += 0.001;
        
        renderer.render(scene, camera);
    }
    animate();

    // Mark canvas as loaded
    canvas.classList.add('loaded');

    // Handle window resize
    function handleResize() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        renderer.dispose();
    };
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initHeroCanvas();
    initDemoCanvas();
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Video play on scroll
    const demoVideo = document.getElementById('demoVideo');
    if (demoVideo) {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.5
        };

        const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    demoVideo.play();
                } else {
                    demoVideo.pause();
                }
            });
        }, observerOptions);

        videoObserver.observe(demoVideo);
    }

    // Animate elements on scroll
    const animateOnScroll = () => {
        const elements = document.querySelectorAll('.feature-card, .card');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, {
            threshold: 0.1
        });

        elements.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    };

    animateOnScroll();
});