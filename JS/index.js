// Import Three.js module
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

// Three.js Scene Setup for Hero Canvas
function initHeroCanvas() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    
    // Use clientWidth and clientHeight to set initial size
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparent background
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
        // Check if canvas is still in the DOM and has a size
        if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
            camera.aspect = canvas.clientWidth / canvas.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        }
    }
    
    window.addEventListener('resize', handleResize);

    // Cleanup logic (optional, but good practice)
    // You can return a cleanup function if you need to destroy this scene later
    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        renderer.dispose();
    };
}

// Three.js Scene Setup for Demo Canvas (Interactive)
// THIS IS THE LOGIC FROM YOUR main.js, WRAPPED IN THE initDemoCanvas FUNCTION
function initDemoCanvas() {
    
    // --- Canvas and Renderer Setup ---
    // Get the canvas from the HTML
    const canvas = document.getElementById('demoCanvas'); // <-- CHANGED from shapeCanvas
    if (canvas) {
        // setting up scene
        const scene = new THREE.Scene();
        
        // setting up camera
        const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        camera.position.z = 8; // Set camera position matching repo demo

        //setting up renderer
        const renderer = new THREE.WebGLRenderer({ 
            canvas, // Render to our specific canvas
            antialias: true,
            alpha: true // Allow transparency
        });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio); // For sharp rendering
        renderer.setClearColor(0x000000, 0); // Transparent background

        // --- Star Shape Geometry (From your original script) ---
        /**
         * Helper function to generate a 10-point star level.
         */
        function createStarLevel(rOuter, rInner, z) {
            const points = [];
            const numPoints = 10; // 5 points, 5 crevices
            for (let i = 0; i < numPoints; i++) {
                const r = (i % 2 === 0) ? rOuter : rInner;
                const angle = (i / numPoints) * 2 * Math.PI - (Math.PI / 2);
                const x = r * Math.cos(angle);
                const y = r * Math.sin(angle);
                points.push(new THREE.Vector3(x, y, z));
            }
            return points;
        }

        const levels = [
            // Level 0 (z = 0) - Small Star
            createStarLevel(2, 1, 0),
            // Level 1 (z = 1) - Small Star
            createStarLevel(2, 1, 1),
            // Level 2 (z = 2) - Large Star
            createStarLevel(4, 2, 2),
            // Level 3 (z = 3) - Large Star
            createStarLevel(4, 2, 3)
        ];

        /**
         * Triangulates a 2D polygon using the Ear Clipping algorithm.
         */
        function triangulatePolygon(points) {
            const indices = points.map((_, i) => i);
            const triangles = [];

            function area(p1, p2, p3) {
                return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
            }

            function isInside(a, b, c, p) {
                const s = a.y * c.x - a.x * c.y + (c.y - a.y) * p.x + (a.x - c.x) * p.y;
                const t = a.x * b.y - a.y * b.x + (a.y - b.y) * p.x + (b.x - a.x) * p.y;
                if ((s < 0) != (t < 0) && s != 0 && t != 0) return false;
                const A = -b.y * c.x + a.y * (c.x - b.x) + a.x * (b.y - c.y) + b.x * c.y;
                if (A < 0) return (s <= 0 && s + t >= A);
                return (s >= 0 && s + t <= A);
            }

            let remainingIndices = [...indices];
            let safety = 1000; 

            while (remainingIndices.length > 3 && safety-- > 0) {
                let isEarFound = false;
                for (let i = 0; i < remainingIndices.length; i++) {
                    const i_prev = (i + remainingIndices.length - 1) % remainingIndices.length;
                    const i_next = (i + 1) % remainingIndices.length;
                    const a_idx = remainingIndices[i_prev];
                    const b_idx = remainingIndices[i];
                    const c_idx = remainingIndices[i_next];
                    const a = points[a_idx];
                    const b = points[b_idx];
                    const c = points[c_idx];

                    if (area(a, b, c) < 0) continue; 
                    let isEar = true;
                    for (let j = 0; j < remainingIndices.length; j++) {
                        if (j === i_prev || j === i || j === i_next) continue;
                        if (isInside(a, b, c, points[remainingIndices[j]])) {
                            isEar = false;
                            break;
                        }
                    }
                    if (isEar) {
                        triangles.push(a_idx, b_idx, c_idx);
                        remainingIndices.splice(i, 1);
                        isEarFound = true;
                        break;
                    }
                }
                if (!isEarFound) {
                     console.warn("Ear clipping failed to find an ear.");
                     break;
                }
            }
            if (remainingIndices.length === 3) {
                triangles.push(remainingIndices[0], remainingIndices[1], remainingIndices[2]);
            }
            return triangles;
        }

        /**
         * Builds the complete geometry from an array of levels.
         */
        function buildConnections(levels) {
            const allVertices = [];
            const indices = [];
            for (const level of levels) {
                for (const point of level) {
                    allVertices.push(point.x, point.y, point.z);
                }
            }
            let levelA_offset = 0;
            for (let i = 0; i < levels.length - 1; i++) {
                const levelA = levels[i];
                const levelB = levels[i + 1];
                const levelB_offset = levelA_offset + levelA.length;
                if (levelA.length !== levelB.length) {
                    console.warn(`Level ${i} and ${i+1} have different vertex counts. Skipping side connection.`);
                    levelA_offset = levelB_offset;
                    continue;
                }
                const pointsPerLevel = levelA.length;
                for (let j = 0; j < pointsPerLevel; j++) {
                    let next_j = (j + 1) % pointsPerLevel;
                    let a = levelA_offset + j;
                    let b = levelA_offset + next_j;
                    let c = levelB_offset + j;
                    let d = levelB_offset + next_j;
                    indices.push(a, b, d);
                    indices.push(a, d, c);
                }
                levelA_offset = levelB_offset;
            }
            const bottomLevel = levels[0];
            const bottomPoints2D = bottomLevel.map(v => ({ x: v.x, y: v.y }));
            const bottomIndices = triangulatePolygon(bottomPoints2D);
            indices.push(...bottomIndices);
            const topLevel = levels[levels.length - 1];
            const topLevelOffset = allVertices.length / 3 - topLevel.length;
            const topPoints2D = topLevel.map(v => ({ x: v.x, y: v.y }));
            const topIndices = triangulatePolygon(topPoints2D);
            for (let k = 0; k < topIndices.length; k += 3) {
                indices.push(
                    topIndices[k] + topLevelOffset,
                    topIndices[k + 2] + topLevelOffset,
                    topIndices[k + 1] + topLevelOffset
                );
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(allVertices, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            return geometry;
        }

        // --- Create the Mesh ---
        const geometry = buildConnections(levels);
        const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
        const shape = new THREE.Mesh(geometry, material);
        scene.add(shape);

        // --- Lights (from repo demo) ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        // --- NEW CONTROLS (from repo's JS/index.js) ---
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let rotation = { x: 0.5, y: 0.5 }; // Start with a slight tilt
        let targetRotation = { x: 0.5, y: 0.5 };
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

        canvas.addEventListener('mouseup', () => isDragging = false);
        canvas.addEventListener('mouseleave', () => isDragging = false);

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                e.preventDefault(); // Prevent page scroll on canvas
                isDragging = true;
                autoRotate = false;
                const touch = e.touches[0];
                previousMousePosition = { x: touch.clientX, y: touch.clientY };
            }
        });

        canvas.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                e.preventDefault(); // Prevent page scroll
                const touch = e.touches[0];
                const deltaX = touch.clientX - previousMousePosition.x;
                const deltaY = touch.clientY - previousMousePosition.y;
                targetRotation.y += deltaX * 0.01;
                targetRotation.x += deltaY * 0.01;
                previousMousePosition = { x: touch.clientX, y: touch.clientY };
            }
        });

        canvas.addEventListener('touchend', () => isDragging = false);

        // Mouse wheel zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            camera.position.z += e.deltaY * 0.01;
            // Clamp zoom
            camera.position.z = Math.max(4, Math.min(20, camera.position.z));
        });

        // --- NEW Resize Handler (from repo) ---
        window.addEventListener('resize', () => {
             if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
                camera.aspect = canvas.clientWidth / canvas.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(canvas.clientWidth, canvas.clientHeight);
            }
        });

        // --- NEW Animate Loop (from repo) ---
        function animate() {
            requestAnimationFrame(animate);
            
            if (autoRotate && !isDragging) {
                targetRotation.y += 0.002;
            }
            
            // Smooth rotation interpolation (lerp)
            rotation.x += (targetRotation.x - rotation.x) * 0.1;
            rotation.y += (targetRotation.y - rotation.y) * 0.1;
            
            // Apply rotation to the star shape
            shape.rotation.x = rotation.x;
            shape.rotation.y = rotation.y;
            
            renderer.render(scene, camera);
        }
        
        // Start the animation
        animate();

        // Mark canvas as loaded (for the spinner)
        canvas.classList.add('loaded');

    } else {
        console.error('Canvas with ID "demoCanvas" not found.');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize both 3D canvases
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
                    demoVideo.play().catch(e => console.error("Video play failed:", e));
                } else {
                    demoVideo.pause();
                }
            });
        }, observerOptions);

        videoObserver.observe(demoVideo);
    }

    // Animate elements on scroll
    const animateOnScroll = () => {
        // Select elements to animate
        const elements = document.querySelectorAll('.feature-card, .card, .hero-title, .hero-subtitle, .feature-list li');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target); // Stop observing once animated
                }
            });
        }, {
            threshold: 0.1
        });

        elements.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
            observer.observe(el);
        });
    };

    animateOnScroll();
});
