import { auth, provider, signInWithPopup, database, ref, get, set } from './firebase.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

// --- Background Animation Logic ---
function initBackgroundCanvas() {
    const canvas = document.getElementById('login-bg');
    if (!canvas) return;

    const scene = new THREE.Scene();
    // Adjust camera for full screen
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    
    camera.position.z = 6;

    const group = new THREE.Group();

    // Box
    const geometry = new THREE.BoxGeometry(5, 5, 5);
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4a90e2, linewidth: 2 });
    const cube = new THREE.LineSegments(edges, lineMaterial);
    group.add(cube);

    // Corner Spheres
    const sphereGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x2d70b3 });
    
    const corners = [
        [-2.5, -2.5, -2.5], [2.5, -2.5, -2.5], [-2.5, 2.5, -2.5], [2.5, 2.5, -2.5],
        [-2.5, -2.5, 2.5], [2.5, -2.5, 2.5], [-2.5, 2.5, 2.5], [2.5, 2.5, 2.5]
    ];
    
    corners.forEach(pos => {
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(pos[0], pos[1], pos[2]);
        group.add(sphere);
    });

    // Inner Torus
    const innerGeometry = new THREE.TorusKnotGeometry(2, 0.25, 100, 16);
    const innerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x4a90e2,
        wireframe: true 
    });
    const torusKnot = new THREE.Mesh(innerGeometry, innerMaterial);
    group.add(torusKnot);

    scene.add(group);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x4a90e2, 1, 100);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Animation Loop
    let animationId;
    function animate() {
        animationId = requestAnimationFrame(animate);
        
        group.rotation.x += 0.003;
        group.rotation.y += 0.005;
        torusKnot.rotation.x += 0.01;
        torusKnot.rotation.y += 0.005;
        
        renderer.render(scene, camera);
    }
    animate();

    // Resize Handler
    function handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    
    window.addEventListener('resize', handleResize);
}

// Initialize animation when DOM is ready
document.addEventListener('DOMContentLoaded', initBackgroundCanvas);

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then(async (result) => {
            const user = result.user;

            const userRef = ref(database, 'users/' + user.uid);
            
            try {
                const snapshot = await get(userRef);
                
                if (!snapshot.exists()) {
                    console.log("New user detected! Creating database profile...");
                    await set(userRef, {
                        email: user.email,
                        name: user.displayName,
                        totalScans: 0,
                        totalLikes: 0,
                        accountCreated: new Date().toISOString(),
                        
                        scans: {}
                    });
                } else {
                    console.log("Existing user found.");
                }
                // 3. Proceed to the site
                window.location.href = 'index.html';
                
            } catch (error) {
                console.error("Database check failed:", error);
            }
        })
        .catch(error => {
            console.error("Login Failed", error);
        });
});