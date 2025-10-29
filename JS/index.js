import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

function initHeroCanvas() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x1a202c, 1);
    camera.position.z = 5;

    const group = new THREE.Group();

    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4a90e2, linewidth: 2 });
    const cube = new THREE.LineSegments(edges, lineMaterial);
    group.add(cube);

    const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x2d70b3 });
    
    const corners = [
        [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]
    ];
    
    corners.forEach(pos => {
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(pos[0], pos[1], pos[2]);
        group.add(sphere);
    });

    const innerGeometry = new THREE.TorusKnotGeometry(0.8, 0.2, 100, 16);
    const innerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x4a90e2,
        wireframe: true 
    });
    const torusKnot = new THREE.Mesh(innerGeometry, innerMaterial);
    group.add(torusKnot);

    scene.add(group);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x4a90e2, 1, 100);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

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

    canvas.classList.add('loaded');

    function handleResize() {
        if (!canvas.isConnected) {
             cancelAnimationFrame(animationId);
             return;
        }
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        renderer.dispose();
    };
}

async function initDemoCanvas() {
    const canvas = document.getElementById('demoCanvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x1a202c, 1);
    camera.position.z = 40;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    let clusteredLevels;
    try {
        const response = await fetch('./Examples/sensor_data.json'); 
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawLevels = await response.json();
        const levels = rawLevels.map(level => 
            level.map(p => new THREE.Vector3(p.x, p.y, p.z))
        );
        
        const gapThresholdSq = calculateGapThreshold(levels);
        clusteredLevels = levels.map(level => clusterLevelByGaps(level, gapThresholdSq));
    } catch (error) {
        console.error("Error loading sensor data:", error);
        return;
    }

    const geometry = buildConnections(clusteredLevels);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        color: 0x00b0ff,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide,
    });

    const model = new THREE.Mesh(geometry, material);
    scene.add(model);
    
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);
    camera.position.z = Math.max(size.x, size.y, size.z) * 1.5;
    camera.lookAt(0, 0, 0);

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let rotation = { x: 0, y: 0 };
    let targetRotation = { x: 0, y: 0.005 };
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

    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });

    canvas.addEventListener('touchstart', (e) => {
        isDragging = true;
        autoRotate = false;
        const touch = e.touches[0];
        previousMousePosition = { x: touch.clientX, y: touch.clientY };
    }, { passive: false });

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
    }, { passive: false });

    canvas.addEventListener('touchend', () => { isDragging = false; });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.02;
        const minZ = Math.max(size.x, size.y, size.z) * 0.5;
        const maxZ = Math.max(size.x, size.y, size.z) * 5;
        camera.position.z = Math.max(minZ, Math.min(maxZ, camera.position.z));
    }, { passive: false });

    let animationId;
    function animate() {
        animationId = requestAnimationFrame(animate);
        
        if (autoRotate && !isDragging) {
            targetRotation.y += 0.005;
        }
        
        rotation.x += (targetRotation.x - rotation.x) * 0.1;
        rotation.y += (targetRotation.y - rotation.y) * 0.1;
        
        model.rotation.x = rotation.x;
        model.rotation.y = rotation.y;
        
        renderer.render(scene, camera);
    }
    animate();

    canvas.classList.add('loaded');

    function handleResize() {
        if (!canvas.isConnected) {
             cancelAnimationFrame(animationId);
             return;
        }
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
    
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationId);
        renderer.dispose();
    };
}

function calculateGapThreshold(levels) {
    if (levels.length === 0 || levels[0].length === 0) return 100;
    
    const numPoints = levels[0].length;
    const angularStep = (2 * Math.PI) / numPoints;
    
    let maxRadius = 0;
    for (const level of levels.slice(0, 10)) {
         if (!level) continue;
        for (const p of level) {
             if (!p) continue;
            const r = Math.sqrt(p.x * p.x + p.y * p.y);
            if (r > maxRadius) maxRadius = r;
        }
    }
    
    const maxArcLength = maxRadius * angularStep;
    return Math.pow(maxArcLength * 100, 2);
}

function clusterLevelByGaps(level, thresholdSq) {
    const contours = [];
    let currentContour = [];
    const numPoints = level.length;
    
    for (let i = 0; i < numPoints; i++) {
        const p1 = level[i];
        const p2 = level[(i + 1) % numPoints];
        
        if (p1.x !== 0 || p1.y !== 0) {
            currentContour.push(p1);
        }
        
        const isMiss = (p2.x === 0 && p2.y === 0);
        let isGap = false;
        if ((p1.x !== 0 || p1.y !== 0) && (p2.x !== 0 || p2.y !== 0)) {
            isGap = p1.distanceToSquared(p2) > thresholdSq;
        }
        
        if ((isMiss || isGap) && currentContour.length > 0) {
            if (currentContour.length > 2) {
                contours.push(currentContour);
            }
            currentContour = [];
        }
    }
    
    if (currentContour.length > 0) {
        if (contours.length > 0) {
            const firstContour = contours[0];
            const lastPoint = currentContour[currentContour.length - 1];
            const firstPoint = firstContour[0];
            
            if (lastPoint.distanceToSquared(firstPoint) <= thresholdSq) {
                contours[0] = [...currentContour, ...firstContour];
            } else if (currentContour.length > 2) {
                contours.push(currentContour);
            }
        } else if (currentContour.length > 2) {
            contours.push(currentContour);
        }
    }
    
    return contours;
}

function getContourCentroid(contour) {
    let x = 0;
    let y = 0;
    for (const p of contour) {
        x += p.x;
        y += p.y;
    }
    return new THREE.Vector2(x / contour.length, y / contour.length);
}

function buildConnections(clusteredLevels) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    let vertexIndex = 0;

    for (let i = 0; i < clusteredLevels.length - 1; i++) {
        const currentContours = clusteredLevels[i];
        const nextContours = clusteredLevels[i+1];

        if (nextContours.length === 0) continue;

        for (const contourA of currentContours) {
            const centroidA = getContourCentroid(contourA);
            let closestContourB = null;
            let minCentroidDistSq = Infinity;

            for (const contourB of nextContours) {
                const centroidB = getContourCentroid(contourB);
                const distSq = centroidA.distanceToSquared(centroidB);
                if (distSq < minCentroidDistSq) {
                    minCentroidDistSq = distSq;
                    closestContourB = contourB;
                }
            }

            if (closestContourB) {
                vertexIndex = stitchContours(vertices, indices, contourA, closestContourB, vertexIndex);
            }
        }
    }

    if (clusteredLevels.length > 0) {
        const bottomContours = clusteredLevels[0];
        for (const contour of bottomContours) {
            const capIndices = fanTriangulation(contour);
            const offset = vertexIndex;
            for (const p of contour) {
                vertices.push(p.x, p.y, p.z);
            }
            for (const idx of capIndices) {
                indices.push(idx + offset);
            }
            vertexIndex += contour.length;
        }

        const topContours = clusteredLevels[clusteredLevels.length - 1];
        for (const contour of topContours) {
            const capIndices = fanTriangulation(contour);
            const offset = vertexIndex;
            for (const p of contour) {
                vertices.push(p.x, p.y, p.z);
            }
            for (let i = capIndices.length - 3; i >= 0; i -= 3) {
                indices.push(capIndices[i] + offset);
                indices.push(capIndices[i + 2] + offset);
                indices.push(capIndices[i + 1] + offset);
            }
            vertexIndex += contour.length;
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    
    return geometry;
}

function stitchContours(vertices, indices, contourA, contourB, vertexIndex) {
    const numPointsA = contourA.length;
    const numPointsB = contourB.length;
    
    if (numPointsA < 2 || numPointsB < 2) return vertexIndex;
    
    const indicesA = [];
    for (const p of contourA) {
        indicesA.push(vertexIndex);
        vertices.push(p.x, p.y, p.z);
        vertexIndex++;
    }
    
    const indicesB = [];
    for (const p of contourB) {
        indicesB.push(vertexIndex);
        vertices.push(p.x, p.y, p.z);
        vertexIndex++;
    }

    let bestB_idx = 0;
    let minStartDistSq = Infinity;
    for (let j = 0; j < numPointsB; j++) {
        const distSq = contourA[0].distanceToSquared(contourB[j]);
        if (distSq < minStartDistSq) {
            minStartDistSq = distSq;
            bestB_idx = j;
        }
    }

    let i = 0;
    let j = bestB_idx;
    let stepsA = 0;
    let stepsB = 0;
    
    while (stepsA < numPointsA || stepsB < numPointsB) {
        if (stepsA >= numPointsA) {
            const fan_A_idx = indicesA[(i - 1 + numPointsA) % numPointsA];
            const pB1_idx = indicesB[j % numPointsB];
            const pB2_idx = indicesB[(j + 1) % numPointsB];
            
            indices.push(fan_A_idx, pB1_idx, pB2_idx);
            j = (j + 1) % numPointsB;
            stepsB++;
            continue;
        }
        
        if (stepsB >= numPointsB) {
            const fan_B_idx = indicesB[(j - 1 + numPointsB) % numPointsB];
            const pA1_idx = indicesA[i % numPointsA];
            const pA2_idx = indicesA[(i + 1) % numPointsA];
            
            indices.push(pA1_idx, fan_B_idx, pA2_idx);
            i = (i + 1) % numPointsA;
            stepsA++;
            continue;
        }

        const pA1_idx = indicesA[i % numPointsA];
        const pA2_idx = indicesA[(i + 1) % numPointsA];
        const pB1_idx = indicesB[j % numPointsB];
        const pB2_idx = indicesB[(j + 1) % numPointsB];
        
        const pA1 = contourA[i % numPointsA];
        const pA2 = contourA[(i + 1) % numPointsA];
        const pB1 = contourB[j % numPointsB];
        const pB2 = contourB[(j + 1) % numPointsB];

        const d1 = pA1.distanceToSquared(pB2);
        const d2 = pA2.distanceToSquared(pB1);

        const remainingA = numPointsA - stepsA;
        const remainingB = numPointsB - stepsB;

        if (remainingA > remainingB) {
            indices.push(pA1_idx, pB1_idx, pA2_idx);
            i = (i + 1) % numPointsA;
            stepsA++;
        } else if (remainingB > remainingA) {
            indices.push(pA1_idx, pB1_idx, pB2_idx);
            j = (j + 1) % numPointsB;
            stepsB++;
        } else {
            if (d1 < d2) {
                indices.push(pA1_idx, pB1_idx, pB2_idx);
                indices.push(pA1_idx, pB2_idx, pA2_idx);
            } else {
                indices.push(pA1_idx, pB1_idx, pA2_idx);
                indices.push(pA2_idx, pB1_idx, pB2_idx);
            }
            i = (i + 1) % numPointsA;
            j = (j + 1) % numPointsB;
            stepsA++;
            stepsB++;
        }
    }

    return vertexIndex;
}

function fanTriangulation(points) {
    const indices = [];
    if (points.length < 3) return indices;

    const rootIndex = 0;
    for (let i = 1; i < points.length - 1; i++) {
        indices.push(rootIndex);
        indices.push(i);
        indices.push(i + 1);
    }
    return indices;
}

document.addEventListener('DOMContentLoaded', () => {
    initHeroCanvas();
    initDemoCanvas();
    
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