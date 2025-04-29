import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OutlineEffect } from './OutlineEffect.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Black background

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Create outline effect
const outlineEffect = new OutlineEffect(renderer, {
    defaultThickness: 0.005,
    defaultColor: new THREE.Color(0xffffff),
    defaultAlpha: 0.45,
    defaultKeepAlive: true
});

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false; // Disable regular zoom, we'll use our custom slider
controls.enablePan = false; // Disable panning
controls.rotateSpeed = 0.8;
controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
};
// Enable full rotation on all axes
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;

// Status message element with more detailed loading info
const statusElement = document.createElement('div');
statusElement.style.position = 'absolute';
statusElement.style.top = '50%';
statusElement.style.left = '50%';
statusElement.style.transform = 'translate(-50%, -50%)';
statusElement.style.color = 'white';
statusElement.style.fontFamily = '"Martian Mono Condensed", monospace';
statusElement.style.fontSize = '18px';
statusElement.style.padding = '10px';
statusElement.style.background = 'rgba(0,0,0,0.7)';
statusElement.style.borderRadius = '5px';
statusElement.style.maxWidth = '80%';
statusElement.style.textAlign = 'center';
statusElement.textContent = 'Preparing to load model...';
document.body.appendChild(statusElement);

// Animation variables
let autoRotate = true;
let autoRotateSpeed = 1.0;
let userInteracting = false;
let transitionDuration = 2000; // 2 second transition for smooth resumption
let transitionStartTime = 0;
let lastUserRotationX = 0;
let zoomLevel = 1.0; // Initial zoom level
let cameraHeight = 0.5; // Initial camera height (0-1 range)
let userReleasedAngle = 0; // Store the angle where the user released
let edgeThreshold = 5; // Fixed edge threshold at 5 degrees
let angularVelocity = 0; // Angular velocity for inertia
let lastRotationTime = 0; // Time of last rotation
let lastRotationAngle = 0; // Last rotation angle
let shaderMode = 'wireframe'; // Current shader mode: 'wireframe' or 'toon'
let isToonMode = false; // Flag to track if we're in toon mode

// Load Google Font
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;500&display=swap';
document.head.appendChild(fontLink);

// Add UI controls
function createUI() {
    // Create the main container
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '10px';
    uiContainer.style.right = '10px';
    uiContainer.style.zIndex = '100';
    
    // Create the header/toggle
    const header = document.createElement('div');
    header.style.backgroundColor = 'rgba(0,0,0,0.7)';
    header.style.color = 'white';
    header.style.padding = '8px 12px';
    header.style.borderRadius = '5px';
    header.style.fontFamily = '"Martian Mono Condensed", monospace';
    header.style.fontSize = '14px';
    header.style.fontWeight = '500';
    header.style.cursor = 'pointer';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.border = '1px solid white';  // Add white outline
    header.textContent = 'Controls';
    
    // Add toggle icon
    const toggleIcon = document.createElement('span');
    toggleIcon.textContent = '▼';
    toggleIcon.style.marginLeft = '10px';
    toggleIcon.style.transition = 'transform 0.3s';
    header.appendChild(toggleIcon);
    
    // Create controls panel
    const controlsPanel = document.createElement('div');
    controlsPanel.style.backgroundColor = 'rgba(0,0,0,0.7)';
    controlsPanel.style.color = 'white';
    controlsPanel.style.padding = '12px';
    controlsPanel.style.marginTop = '5px';
    controlsPanel.style.borderRadius = '5px';
    controlsPanel.style.fontFamily = '"Martian Mono Condensed", monospace';
    controlsPanel.style.width = '220px';
    controlsPanel.style.transition = 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out';
    controlsPanel.style.overflow = 'hidden';
    controlsPanel.style.maxHeight = '500px'; // Starting expanded
    controlsPanel.style.opacity = '1';
    controlsPanel.style.border = '1px solid white';  // Add white outline
    
    // Toggle controls visibility
    header.addEventListener('click', () => {
        if (controlsPanel.style.maxHeight === '0px') {
            controlsPanel.style.maxHeight = '500px';
            controlsPanel.style.opacity = '1';
            toggleIcon.style.transform = 'rotate(0deg)';
        } else {
            controlsPanel.style.maxHeight = '0px';
            controlsPanel.style.opacity = '0';
            toggleIcon.style.transform = 'rotate(-90deg)';
        }
    });
    
    // Add header and panel to container
    uiContainer.appendChild(header);
    uiContainer.appendChild(controlsPanel);
    
    // Function to create a slider with label and value display
    function createSlider(name, label, min, max, value, step = 1, unit = '%') {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';
        
        const labelEl = document.createElement('label');
        labelEl.style.display = 'block';
        labelEl.style.marginBottom = '5px';
        labelEl.style.fontSize = '13px';
        labelEl.htmlFor = name;
        labelEl.textContent = label.toUpperCase();
        
        const sliderContainer = document.createElement('div');
        sliderContainer.style.display = 'flex';
        sliderContainer.style.alignItems = 'center';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = name;
        slider.min = min;
        slider.max = max;
        slider.value = value;
        slider.step = step;
        slider.style.width = '85%';
        slider.style.height = '6px';
        slider.style.background = '#444';
        slider.style.borderRadius = '3px';
        slider.style.appearance = 'none';
        
        const valueDisplay = document.createElement('span');
        valueDisplay.style.marginLeft = '8px';
        valueDisplay.style.fontSize = '12px';
        valueDisplay.style.minWidth = '40px';
        valueDisplay.style.textAlign = 'right';
        valueDisplay.textContent = `${value}${unit}`;
        
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueDisplay);
        
        container.appendChild(labelEl);
        container.appendChild(sliderContainer);
        
        return { container, slider, valueDisplay };
    }
    
    // Create color picker with label
    function createColorPicker(name, label, value) {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';
        
        const labelEl = document.createElement('label');
        labelEl.style.display = 'block';
        labelEl.style.marginBottom = '5px';
        labelEl.style.fontSize = '13px';
        labelEl.htmlFor = name;
        labelEl.textContent = label.toUpperCase();
        
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.id = name;
        picker.value = value;
        picker.style.width = '100%';
        picker.style.height = '25px';
        picker.style.padding = '0';
        picker.style.border = 'none';
        picker.style.borderRadius = '3px';
        picker.style.background = 'none';
        
        container.appendChild(labelEl);
        container.appendChild(picker);
        
        return { container, picker };
    }
    
    // Create button
    function createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text.toUpperCase();
        button.style.padding = '8px';
        button.style.width = '100%';
        button.style.cursor = 'pointer';
        button.style.backgroundColor = '#444';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.color = 'white';
        button.style.fontFamily = '"Martian Mono Condensed", monospace';
        button.style.fontSize = '13px';
        button.style.marginTop = '5px';
        button.onclick = onClick;
        
        return button;
    }
    
    // Create radio buttons for shader mode
    function createRadioGroup(name, label, options, defaultValue) {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';
        
        const labelEl = document.createElement('label');
        labelEl.style.display = 'block';
        labelEl.style.marginBottom = '5px';
        labelEl.style.fontSize = '13px';
        labelEl.textContent = label.toUpperCase();
        
        const radioContainer = document.createElement('div');
        radioContainer.style.display = 'flex';
        radioContainer.style.flexDirection = 'column';
        
        const radioButtons = [];
        
        options.forEach(option => {
            const radioWrap = document.createElement('div');
            radioWrap.style.display = 'flex';
            radioWrap.style.alignItems = 'center';
            radioWrap.style.marginBottom = '5px';
            
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.id = `${name}-${option.value}`;
            radio.name = name;
            radio.value = option.value;
            radio.checked = option.value === defaultValue;
            radio.style.margin = '0 8px 0 0';
            
            const radioLabel = document.createElement('label');
            radioLabel.htmlFor = `${name}-${option.value}`;
            radioLabel.textContent = option.label.toUpperCase();
            radioLabel.style.fontSize = '12px';
            
            radioWrap.appendChild(radio);
            radioWrap.appendChild(radioLabel);
            radioContainer.appendChild(radioWrap);
            
            radioButtons.push(radio);
        });
        
        container.appendChild(labelEl);
        container.appendChild(radioContainer);
        
        return { container, radioButtons };
    }
    
    // Opacity slider
    const opacity = createSlider('opacity', 'Wireframe Opacity', 0, 100, 45);
    
    // Background color
    const bgColor = createColorPicker('bgColor', 'Background Color', '#000000');
    
    // Shader mode options
    const shaderOptions = [
        { value: 'wireframe', label: 'Wireframe' },
        { value: 'toon', label: 'Toon Outline' }
    ];
    const shaderMode = createRadioGroup('shaderMode', 'Shader Mode', shaderOptions, 'wireframe');
    
    // Zoom slider
    const zoom = createSlider('zoom', 'Zoom Level', 50, 200, 100);
    
    // Camera height slider
    const camHeight = createSlider('cameraHeight', 'Camera Height', 0, 100, 50);
    
    // Rotation speed slider
    const rotSpeed = createSlider('rotationSpeed', 'Rotation Speed', 0, 5, 1, 0.1, 'x');
    
    // Retry button
    const retryButton = createButton('Reload', () => loadModel(true));
    
    // Model label
    const modelLabel = document.createElement('div');
    modelLabel.style.marginBottom = '15px';
    modelLabel.style.color = 'white';
    modelLabel.style.fontFamily = '"Martian Mono Condensed", monospace';
    modelLabel.style.fontSize = '13px';
    modelLabel.textContent = 'HP-01-TURT';
    
    // Add model label to panel (put it at the top of the panel)
    controlsPanel.insertBefore(modelLabel, controlsPanel.firstChild);
    
    // Add all controls to the panel
    controlsPanel.appendChild(opacity.container);
    controlsPanel.appendChild(shaderMode.container);
    controlsPanel.appendChild(bgColor.container);
    controlsPanel.appendChild(zoom.container);
    controlsPanel.appendChild(camHeight.container);
    controlsPanel.appendChild(rotSpeed.container);
    controlsPanel.appendChild(retryButton);
    
    // Add to document
    document.body.appendChild(uiContainer);
    
    // Event listeners for shader mode
    shaderMode.radioButtons.forEach(radio => {
        radio.addEventListener('change', (event) => {
            if (event.target.checked) {
                updateShaderMode(event.target.value);
            }
        });
    });
    
    return {
        panel: controlsPanel,
        header: header,
        opacitySlider: opacity.slider,
        opacityValue: opacity.valueDisplay,
        bgColorPicker: bgColor.picker,
        zoomSlider: zoom.slider,
        zoomValue: zoom.valueDisplay,
        cameraHeightSlider: camHeight.slider,
        cameraHeightValue: camHeight.valueDisplay,
        rotationSpeedSlider: rotSpeed.slider,
        rotationSpeedValue: rotSpeed.valueDisplay,
        retryButton: retryButton,
        shaderModeRadios: shaderMode.radioButtons
    };
}

const uiControls = createUI();

// Global variables for model management
let loadedModel = null;
let isLoading = false;
let modelFilename = 'https://crunchlabs-ono-cloud.s3.us-west-1.amazonaws.com/HP-01-TURT-GAMEREADY-4.fbx';

// Function to log messages (no longer shows in UI, only in console if needed)
function logMessage(message) {
    // Silent logging - only uncomment for debugging
    // console.log(message);
}

// Function to apply wireframe to model
function applyWireframeToModel(model) {
    logMessage('Applying outline-only wireframe to model');
    
    // Create a group to hold all edges
    const edgesGroup = new THREE.Group();
    
    // Set up edge color (white always)
    const edgeColor = new THREE.Color(0xffffff);
    
    // Store the edge material for later color updates
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: edgeColor,
        linewidth: 1,  // Note: linewidth only works on certain GPUs/browsers
        transparent: true,
        opacity: 0.45   // Add transparency to see through the model
    });
    
    // Store reference for later updates
    model.userData.wireframeMaterial = edgeMaterial;
    
    // Process all meshes - extract edges instead of using wireframe material
    model.traverse((child) => {
        if (child.isMesh) {
            logMessage(`Processing mesh: ${child.name} - extracting edges only`);
            
            // Hide the original mesh
            child.visible = false;
            
            // Extract only the edges with a threshold angle
            const edges = new THREE.EdgesGeometry(child.geometry, edgeThreshold); 
            const line = new THREE.LineSegments(edges, edgeMaterial);
            
            // Copy the mesh's position/rotation/scale
            line.position.copy(child.position);
            line.rotation.copy(child.rotation);
            line.scale.copy(child.scale);
            line.matrix.copy(child.matrix);
            line.matrixWorld.copy(child.matrixWorld);
            
            // Add to the group
            edgesGroup.add(line);
        }
    });
    
    // Add the edges group to the model
    model.add(edgesGroup);
    
    // Store the edges group for later reference
    model.userData.edgesGroup = edgesGroup;
    
    isToonMode = false; // Set mode flag
    
    return edgesGroup;
}

// Function to apply toon material with outline
function applyToonOutlineToModel(model) {
    logMessage('Applying toon material with outline effect');
    
    // Remove existing edges group if present
    if (model.userData.edgesGroup) {
        model.remove(model.userData.edgesGroup);
        model.userData.edgesGroup = null;
    }
    
    // Create a gradientMap for toon shading
    const colors = new Uint8Array([0, 128, 255, 255]);
    const gradientMap = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
    gradientMap.needsUpdate = true;
    
    // Process all meshes and apply toon material
    model.traverse((child) => {
        if (child.isMesh) {
            logMessage(`Processing mesh: ${child.name} - applying toon material`);
            
            // Create toon material
            const toonMaterial = new THREE.MeshToonMaterial({
                color: 0xffffff,
                gradientMap: gradientMap,
                transparent: true,
                opacity: 0.8
            });
            
            // Store original material and geometry
            child.userData.originalMaterial = child.material;
            
            // Apply new material
            child.material = toonMaterial;
            
            // Make visible
            child.visible = true;
        }
    });
    
    isToonMode = true; // Set mode flag
    
    return model;
}

// Function to update the shader mode
function updateShaderMode(mode) {
    if (!loadedModel) return;
    
    shaderMode = mode;
    
    if (mode === 'wireframe') {
        applyWireframeToModel(loadedModel);
    } else if (mode === 'toon') {
        applyToonOutlineToModel(loadedModel);
    }
}

// Update opacity based on the slider
uiControls.opacitySlider.addEventListener('input', (event) => {
    if (!loadedModel) return;
    
    const opacity = parseInt(event.target.value) / 100;
    
    if (isToonMode) {
        // In toon mode, update the outline effect's alpha
        outlineEffect.visibleEdgeColor.setAlpha(opacity);
        
        // Also update the materials if needed
        loadedModel.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.opacity = Math.min(0.8, opacity * 1.5); // Scale the opacity for better balance
            }
        });
    } else if (loadedModel.userData.wireframeMaterial) {
        // In wireframe mode, update the wireframe material
        loadedModel.userData.wireframeMaterial.opacity = opacity;
    }
    
    uiControls.opacityValue.textContent = `${event.target.value}%`;
});

// Update background color
uiControls.bgColorPicker.addEventListener('input', (event) => {
    const color = new THREE.Color(event.target.value);
    scene.background = color;
});

// Update zoom level
uiControls.zoomSlider.addEventListener('input', (event) => {
    zoomLevel = parseInt(event.target.value) / 100;
    updateCameraDistance();
    uiControls.zoomValue.textContent = `${event.target.value}%`;
});

// Update camera height
uiControls.cameraHeightSlider.addEventListener('input', (event) => {
    cameraHeight = parseInt(event.target.value) / 100;
    updateCameraHeight();
    uiControls.cameraHeightValue.textContent = `${event.target.value}%`;
});

// Update rotation speed
uiControls.rotationSpeedSlider.addEventListener('input', (event) => {
    autoRotateSpeed = parseFloat(event.target.value);
    uiControls.rotationSpeedValue.textContent = `${autoRotateSpeed.toFixed(1)}x`;
});

// Function to update camera height
function updateCameraHeight() {
    if (!loadedModel) return;
    
    const box = new THREE.Box3().setFromObject(loadedModel);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Map the 0-1 height value to a reasonable range
    // At 0, camera is at the bottom of the model
    // At 1, camera is well above the model
    const minHeight = controls.target.y - (maxDim/2); // Bottom of model
    const maxHeight = controls.target.y + (maxDim*1.5); // Well above model
    
    // Calculate new height
    const newHeight = minHeight + (cameraHeight * (maxHeight - minHeight));
    
    // Keep the current horizontal distance
    const horizontalDistance = Math.sqrt(
        Math.pow(camera.position.x - controls.target.x, 2) +
        Math.pow(camera.position.z - controls.target.z, 2)
    );
    
    // Current rotation angle in the horizontal plane
    const angle = Math.atan2(
        camera.position.z - controls.target.z,
        camera.position.x - controls.target.x
    );
    
    // Update camera position, maintaining the same horizontal distance and angle
    camera.position.y = newHeight;
    camera.position.x = controls.target.x + horizontalDistance * Math.cos(angle);
    camera.position.z = controls.target.z + horizontalDistance * Math.sin(angle);
    
    camera.lookAt(controls.target);
    controls.update();
}

// Function to update camera distance based on zoom level
function updateCameraDistance() {
    if (!loadedModel) return;
    
    const box = new THREE.Box3().setFromObject(loadedModel);
    const center = controls.target;
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Calculate ideal distance based on field of view and model size
    const fov = camera.fov * (Math.PI / 180);
    const idealDistance = (maxDim / 2) / Math.tan(fov / 2);
    
    // Apply zoom factor - higher values = zoomed out
    const distance = idealDistance * (2.0 / zoomLevel);
    
    // Current horizontal angle
    const angle = Math.atan2(
        camera.position.z - controls.target.z,
        camera.position.x - controls.target.x
    );
    
    // Current height (y position)
    const height = camera.position.y;
    
    // Update camera position, maintaining the same height and horizontal angle
    camera.position.x = controls.target.x + distance * Math.cos(angle);
    camera.position.z = controls.target.z + distance * Math.sin(angle);
    camera.position.y = height; // Keep the same height
    
    camera.lookAt(controls.target);
    controls.update();
}

// Track mouse movement for inertia calculation
function calculateAngularVelocity() {
    const currentTime = Date.now();
    const currentAngle = Math.atan2(
        camera.position.z - controls.target.z,
        camera.position.x - controls.target.x
    );
    
    if (lastRotationTime && currentTime - lastRotationTime < 100) {
        const deltaTime = (currentTime - lastRotationTime) / 1000; // in seconds
        let deltaAngle = currentAngle - lastRotationAngle;
        
        // Handle angle wrapping
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
        
        // Calculate angular velocity (radians per second)
        angularVelocity = deltaAngle / deltaTime;
    }
    
    lastRotationTime = currentTime;
    lastRotationAngle = currentAngle;
}

// Event handlers for orbit controls to track user interaction
renderer.domElement.addEventListener('mousedown', () => {
    userInteracting = true;
    autoRotate = false;
    angularVelocity = 0;
    lastRotationTime = Date.now();
    lastRotationAngle = Math.atan2(
        camera.position.z - controls.target.z,
        camera.position.x - controls.target.x
    );
});

renderer.domElement.addEventListener('mousemove', () => {
    if (userInteracting) {
        calculateAngularVelocity();
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    userInteracting = false;
    userReleasedAngle = Math.atan2(
        camera.position.z - controls.target.z,
        camera.position.x - controls.target.x
    );
    transitionStartTime = Date.now();
    autoRotate = true; // Immediately start auto-rotating
});

// Add touch event handlers for mobile
renderer.domElement.addEventListener('touchstart', (event) => {
    userInteracting = true;
    autoRotate = false;
    angularVelocity = 0;
    lastRotationTime = Date.now();
    lastRotationAngle = Math.atan2(
        camera.position.z - controls.target.z,
        camera.position.x - controls.target.x
    );
});

renderer.domElement.addEventListener('touchmove', (event) => {
    if (userInteracting) {
        calculateAngularVelocity();
    }
});

renderer.domElement.addEventListener('touchend', (event) => {
    userInteracting = false;
    userReleasedAngle = Math.atan2(
        camera.position.z - controls.target.z,
        camera.position.x - controls.target.x
    );
    transitionStartTime = Date.now();
    autoRotate = true; // Resume auto-rotation
});

// Start loading the model
loadModel();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Update orbit control transition
function updateOrbitTransition() {
    if (!userInteracting && autoRotate) {
        const currentTime = Date.now();
        const elapsedTime = currentTime - transitionStartTime;
        
        // Get current horizontal distance
        const horizontalDistance = Math.sqrt(
            Math.pow(camera.position.x - controls.target.x, 2) +
            Math.pow(camera.position.z - controls.target.z, 2)
        );
        
        // Current height (y position)
        const currentHeight = camera.position.y;
        
        if (elapsedTime < transitionDuration) {
            // For the initial inertia phase, apply angular velocity with easing
            const initialInertiaPhase = Math.min(1000, transitionDuration / 2); // 1 second or half transition time
            
            if (elapsedTime < initialInertiaPhase) {
                // In initial inertia phase, use angular velocity with decay
                const decayFactor = 1 - (elapsedTime / initialInertiaPhase);
                const inertiaAngle = userReleasedAngle + (angularVelocity * elapsedTime * 0.001 * decayFactor);
                
                // Set new position with inertia
                camera.position.x = controls.target.x + horizontalDistance * Math.cos(inertiaAngle);
                camera.position.z = controls.target.z + horizontalDistance * Math.sin(inertiaAngle);
            } else {
                // After inertia phase, transition to auto-rotation
                const t = (elapsedTime - initialInertiaPhase) / (transitionDuration - initialInertiaPhase);
                const easedT = easeOutCubic(t);
                
                // Calculate the rotation after inertia phase
                const postInertiaAngle = userReleasedAngle + (angularVelocity * initialInertiaPhase * 0.001);
                
                // Auto-rotation speed
                const autoRotationSpeed = 0.05 * autoRotateSpeed;
                const targetAngle = postInertiaAngle + (autoRotationSpeed * (elapsedTime - initialInertiaPhase) * 0.001);
                
                // Blend between inertia and auto-rotation
                const blendedAngle = postInertiaAngle + (targetAngle - postInertiaAngle) * easedT;
                
                // Set new position
                camera.position.x = controls.target.x + horizontalDistance * Math.cos(blendedAngle);
                camera.position.z = controls.target.z + horizontalDistance * Math.sin(blendedAngle);
            }
            
            camera.position.y = currentHeight; // Maintain height
        } else {
            // After transition is complete, just do regular rotation
            const timeInSeconds = currentTime * 0.001;
            // Calculate where we ended up after the transition
            const postTransitionAngle = userReleasedAngle + 
                (angularVelocity * Math.min(1000, transitionDuration/2) * 0.001) + 
                (0.05 * autoRotateSpeed * (transitionDuration - Math.min(1000, transitionDuration/2)) * 0.001);
            
            // Continue rotating from that point
            const rotationAngle = postTransitionAngle + (0.05 * autoRotateSpeed * (elapsedTime - transitionDuration) * 0.001);
            
            // Set new position
            camera.position.x = controls.target.x + horizontalDistance * Math.cos(rotationAngle);
            camera.position.z = controls.target.z + horizontalDistance * Math.sin(rotationAngle);
            camera.position.y = currentHeight; // Maintain the same height
        }
        
        camera.lookAt(controls.target);
    }
}

// Cubic ease out function
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update orbit transition
    updateOrbitTransition();
    
    // Only use controls dampening when user is interacting
    if (userInteracting) {
        controls.update();
    }
    
    if (isToonMode) {
        outlineEffect.render(scene, camera);
    } else {
        renderer.render(scene, camera);
    }
}

animate(); 