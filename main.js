import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

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

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false; // Disable regular zoom, we'll use our custom slider
controls.enablePan = false; // Disable panning
controls.rotateSpeed = 0.8;

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
let edgeThreshold = 5; // Default edge threshold in degrees (1-89)

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
        labelEl.textContent = label;
        
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
        labelEl.textContent = label;
        
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
        button.textContent = text;
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
    
    // Opacity slider
    const opacity = createSlider('opacity', 'Wireframe Opacity', 0, 100, 45);
    
    // Edge Threshold slider
    const threshold = createSlider('threshold', 'Edge Threshold', 1, 89, 5, 1, '°');
    
    // Background color
    const bgColor = createColorPicker('bgColor', 'Background Color', '#000000');
    
    // Zoom slider
    const zoom = createSlider('zoom', 'Zoom Level', 50, 200, 100);
    
    // Camera height slider
    const camHeight = createSlider('cameraHeight', 'Camera Height', 0, 100, 50);
    
    // Rotation speed slider
    const rotSpeed = createSlider('rotationSpeed', 'Rotation Speed', 0, 5, 1, 0.1, 'x');
    
    // Retry button
    const retryButton = createButton('Retry Loading', () => loadModel(true));
    
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
    controlsPanel.appendChild(threshold.container);
    controlsPanel.appendChild(bgColor.container);
    controlsPanel.appendChild(zoom.container);
    controlsPanel.appendChild(camHeight.container);
    controlsPanel.appendChild(rotSpeed.container);
    controlsPanel.appendChild(retryButton);
    
    // Add to document
    document.body.appendChild(uiContainer);
    
    return {
        panel: controlsPanel,
        header: header,
        opacitySlider: opacity.slider,
        opacityValue: opacity.valueDisplay,
        thresholdSlider: threshold.slider,
        thresholdValue: threshold.valueDisplay,
        bgColorPicker: bgColor.picker,
        zoomSlider: zoom.slider,
        zoomValue: zoom.valueDisplay,
        cameraHeightSlider: camHeight.slider,
        cameraHeightValue: camHeight.valueDisplay,
        rotationSpeedSlider: rotSpeed.slider,
        rotationSpeedValue: rotSpeed.valueDisplay,
        retryButton: retryButton
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

// Function to regenerate wireframe with new threshold
function regenerateWireframe(model, threshold) {
    if (!model || !model.userData.edgesGroup) return;
    
    // Remove old edges group
    const oldEdgesGroup = model.userData.edgesGroup;
    model.remove(oldEdgesGroup);
    
    // Create a new edges group
    const newEdgesGroup = new THREE.Group();
    
    // Material for wireframe
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 1,
        transparent: true,
        opacity: parseFloat(uiControls.opacitySlider.value) / 100
    });
    
    // Store the material for later updates
    model.userData.wireframeMaterial = edgeMaterial;
    
    // Create new edge geometry for each mesh
    model.traverse((child) => {
        if (child.isMesh) {
            // Create new edges with the updated threshold
            const edges = new THREE.EdgesGeometry(child.geometry, threshold);
            const line = new THREE.LineSegments(edges, edgeMaterial);
            
            // Copy transform properties
            line.position.copy(child.position);
            line.rotation.copy(child.rotation);
            line.scale.copy(child.scale);
            line.matrix.copy(child.matrix);
            line.matrixWorld.copy(child.matrixWorld);
            
            newEdgesGroup.add(line);
        }
    });
    
    // Add new edges group
    model.add(newEdgesGroup);
    model.userData.edgesGroup = newEdgesGroup;
    
    return newEdgesGroup;
}

// Create loading overlay
function createLoadingOverlay() {
    // Hide the original status element 
    statusElement.style.display = 'none';
    
    // Main overlay container
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'black';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.transition = 'opacity 1s ease-out';
    
    // Create a container for all elements that should fade together
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.alignItems = 'center';
    overlay.appendChild(contentContainer);
    
    // Title
    const title = document.createElement('div');
    title.textContent = 'LOADING MODEL';
    title.style.color = 'white';
    title.style.fontFamily = '"Martian Mono Condensed", monospace';
    title.style.fontSize = '32px';
    title.style.marginBottom = '30px';
    title.style.letterSpacing = '3px';
    contentContainer.appendChild(title);
    
    // Container for progress bar
    const progressContainer = document.createElement('div');
    progressContainer.style.width = '60%';
    progressContainer.style.maxWidth = '500px';
    progressContainer.style.height = '30px';
    progressContainer.style.border = '3px solid white';
    progressContainer.style.padding = '2px';
    progressContainer.style.position = 'relative';
    progressContainer.style.display = 'flex';
    progressContainer.style.alignItems = 'stretch';
    contentContainer.appendChild(progressContainer);
    
    // Create 20 empty block slots (each representing 5%)
    const blocks = [];
    const totalBlocks = 20;
    
    for (let i = 0; i < totalBlocks; i++) {
        const block = document.createElement('div');
        block.style.flex = '1';
        block.style.margin = '0 2px';
        block.style.backgroundColor = 'transparent';
        block.style.transition = 'none'; // No transition for retro feel
        progressContainer.appendChild(block);
        blocks.push(block);
    }
    
    // Progress text
    const progressText = document.createElement('div');
    progressText.textContent = '0%';
    progressText.style.color = 'white';
    progressText.style.fontFamily = '"Martian Mono Condensed", monospace';
    progressText.style.fontSize = '16px';
    progressText.style.marginTop = '15px';
    contentContainer.appendChild(progressText);
    
    // Status text
    const statusText = document.createElement('div');
    statusText.textContent = 'Initializing...';
    statusText.style.color = 'white';
    statusText.style.fontFamily = '"Martian Mono Condensed", monospace';
    statusText.style.fontSize = '18px';
    statusText.style.marginTop = '30px';
    contentContainer.appendChild(statusText);
    
    // Animate first 3 bars with delay
    let currentBlock = 0;
    const initialBlocks = 3;
    const initialDelay = 500; // 0.5s
    
    function animateInitialBlocks() {
        if (currentBlock < initialBlocks) {
            // Fill in the next block
            blocks[currentBlock].style.backgroundColor = 'white';
            
            // Update percentage
            const percent = (currentBlock + 1) * 5;
            progressText.textContent = `${percent}%`;
            
            currentBlock++;
            setTimeout(animateInitialBlocks, initialDelay);
        }
    }
    
    // Start the initial animation
    animateInitialBlocks();
    
    // Update progress function - fills in blocks up to the percentage
    function updateProgress(percent) {
        // Update text
        progressText.textContent = `${percent}%`;
        
        // Calculate how many blocks should be filled
        const blocksToFill = Math.floor(percent / 5);
        
        // Fill in blocks one by one
        for (let i = 0; i < totalBlocks; i++) {
            if (i < blocksToFill) {
                blocks[i].style.backgroundColor = 'white';
            } else {
                blocks[i].style.backgroundColor = 'transparent';
            }
        }
    }
    
    // Show success and fade out
    function showSuccess() {
        // Animate filling the rest of the progress bar
        const currentPercent = parseInt(progressText.textContent);
        const currentBlocksFilled = Math.floor(currentPercent / 5);
        const remainingBlocks = totalBlocks - currentBlocksFilled;
        let blockCount = 0;
        
        function animateRemaining() {
            if (blockCount < remainingBlocks) {
                // Fill in the next block
                blocks[currentBlocksFilled + blockCount].style.backgroundColor = 'white';
                
                // Update percentage
                const nextPercent = currentPercent + ((blockCount + 1) * 5);
                progressText.textContent = `${nextPercent}%`;
                
                blockCount++;
                setTimeout(animateRemaining, 100);
            } else {
                // All blocks filled, show success message
                statusText.textContent = 'MODEL LOADED SUCCESSFULLY';
                
                // Fade out everything together after a delay
                setTimeout(() => {
                    overlay.style.opacity = '0';
                    
                    // Remove from DOM after fade out
                    setTimeout(() => {
                        if (overlay.parentNode) {
                            overlay.parentNode.removeChild(overlay);
                            // Show UI after loading is complete
                            statusElement.style.display = 'none';
                        }
                    }, 1000);
                }, 500);
            }
        }
        
        // Start filling the remaining blocks
        animateRemaining();
    }
    
    // Add to document
    document.body.appendChild(overlay);
    
    return {
        overlay,
        updateProgress,
        showSuccess,
        statusText,
        blocks
    };
}

// Function to load the model
function loadModel(isRetry = false) {
    if (isLoading && !isRetry) return;
    
    isLoading = true;
    
    // Create or reset loading overlay
    const loadingOverlay = createLoadingOverlay();
    
    if (isRetry) {
        if (loadedModel) {
            scene.remove(loadedModel);
            loadedModel = null;
        }
        logMessage('Retrying model load...');
    }
    
    // We're not using statusElement anymore, all status is shown in the overlay
    
    logMessage(`Attempting to load: ${modelFilename}`);
    
    // Check if file exists first
    fetch(modelFilename)
        .then(response => {
            if (!response.ok) {
                throw new Error(`File not accessible (${response.status})`);
            }
            
            logMessage(`File exists. Size: ${response.headers.get('content-length')} bytes`);
            loadingOverlay.statusText.textContent = 'FILE FOUND - LOADING MODEL DATA';
            
            // Create loader with better error handling
            const loadManager = new THREE.LoadingManager();
            
            loadManager.onProgress = (url, loaded, total) => {
                const percent = Math.round((loaded / total) * 100);
                // Update loading overlay instead of statusElement
                logMessage(`Loading progress: ${percent}%`);
                
                if (percent > 15) { // Only update if beyond initial animation
                    // Calculate the exact number of blocks to fill
                    const blocksFilled = Math.min(Math.floor(percent / 5), 20);
                    
                    // Make sure we don't go backwards in visual progress
                    const currentVisibleBlocks = loadingOverlay.blocks.filter(
                        block => block.style.backgroundColor === 'white'
                    ).length;
                    
                    // Only fill blocks that haven't been filled yet
                    if (blocksFilled > currentVisibleBlocks) {
                        for (let i = currentVisibleBlocks; i < blocksFilled; i++) {
                            loadingOverlay.blocks[i].style.backgroundColor = 'white';
                        }
                        loadingOverlay.progressText.textContent = `${blocksFilled * 5}%`;
                    }
                }
            };
            
            loadManager.onError = (url) => {
                logMessage(`Error loading: ${url}`);
                loadingOverlay.statusText.textContent = 'ERROR LOADING MODEL';
                isLoading = false;
            };
            
            const fbxLoader = new FBXLoader(loadManager);
            
            // Add a timeout to handle stalled loading
            const loadingTimeout = setTimeout(() => {
                if (isLoading) {
                    logMessage('Loading timed out after 30 seconds');
                    loadingOverlay.statusText.textContent = 'LOADING TIMED OUT';
                }
            }, 30000);
            
            // Start loading the model
            fbxLoader.load(
                modelFilename,
                (fbx) => {
                    clearTimeout(loadingTimeout);
                    
                    logMessage('Model loaded successfully!');
                    loadingOverlay.showSuccess();
                    
                    // Scale and position the model
                    fbx.scale.set(0.02, 0.02, 0.02);
                    fbx.position.set(0, 0, 0);
                    
                    // Check if model has any meshes
                    let hasMeshes = false;
                    fbx.traverse(child => {
                        if (child.isMesh) {
                            hasMeshes = true;
                            logMessage(`Found mesh: ${child.name}`);
                        }
                    });
                    
                    if (!hasMeshes) {
                        logMessage('WARNING: Model has no meshes!');
                    }
                    
                    // Apply wireframe
                    applyWireframeToModel(fbx);
                    
                    // Add to scene
                    scene.add(fbx);
                    loadedModel = fbx;
                    
                    // Center camera on model
                    const box = new THREE.Box3().setFromObject(fbx);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    logMessage(`Model size: ${JSON.stringify(size)}`);
                    
                    const maxDim = Math.max(size.x, size.y, size.z);
                    camera.position.set(center.x, center.y + maxDim/3, center.z + maxDim*1.5);
                    controls.target.set(center.x, center.y, center.z);
                    controls.update();
                    
                    // Initialize camera height
                    updateCameraHeight();
                    
                    isLoading = false;
                },
                (xhr) => {
                    const percentComplete = Math.round(xhr.loaded / xhr.total * 100);
                    logMessage(`Loading progress: ${percentComplete}% (${xhr.loaded}/${xhr.total} bytes)`);
                },
                (error) => {
                    clearTimeout(loadingTimeout);
                    logMessage(`Error loading model: ${error.message || error}`);
                    loadingOverlay.statusText.textContent = 'ERROR LOADING MODEL';
                    isLoading = false;
                }
            );
        })
        .catch(error => {
            logMessage(`Error checking file: ${error.message}`);
            loadingOverlay.statusText.textContent = 'ERROR LOADING MODEL';
            isLoading = false;
        });
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
    
    return edgesGroup;
}

// Update opacity based on the slider
uiControls.opacitySlider.addEventListener('input', (event) => {
    if (!loadedModel || !loadedModel.userData.wireframeMaterial) return;
    
    const opacity = parseInt(event.target.value) / 100;
    loadedModel.userData.wireframeMaterial.opacity = opacity;
    uiControls.opacityValue.textContent = `${event.target.value}%`;
});

// Edge threshold slider
uiControls.thresholdSlider.addEventListener('input', (event) => {
    if (!loadedModel) return;
    
    edgeThreshold = parseInt(event.target.value);
    uiControls.thresholdValue.textContent = `${edgeThreshold}°`;
    
    // Regenerate wireframe with new threshold
    regenerateWireframe(loadedModel, edgeThreshold);
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

// Event handlers for orbit controls to track user interaction
renderer.domElement.addEventListener('mousedown', () => {
    userInteracting = true;
    autoRotate = false;
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
            // Simple easing function (cubic ease-out)
            const t = elapsedTime / transitionDuration;
            const easedT = easeOutCubic(t);
            
            // Calculate the auto-rotation angle based on time
            const timeInSeconds = currentTime * 0.001; // Convert to seconds
            const autoRotationSpeed = 0.05 * autoRotateSpeed;
            
            // Start angle is where user released
            // Target angle is based on continuous rotation
            const startAngle = userReleasedAngle;
            const targetAngle = startAngle + (autoRotationSpeed * elapsedTime * 0.001);
            
            // Blend between current position and smooth auto-rotation
            const blendedAngle = startAngle + (targetAngle - startAngle) * easedT;
            
            // Set new position
            camera.position.x = controls.target.x + horizontalDistance * Math.cos(blendedAngle);
            camera.position.z = controls.target.z + horizontalDistance * Math.sin(blendedAngle);
            camera.position.y = currentHeight; // Maintain the same height
        } else {
            // After transition is complete, just do regular rotation
            const timeInSeconds = currentTime * 0.001;
            const baseAngle = userReleasedAngle + (0.05 * autoRotateSpeed * transitionDuration * 0.001);
            const rotationAngle = baseAngle + (0.05 * autoRotateSpeed * (elapsedTime - transitionDuration) * 0.001);
            
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
    
    renderer.render(scene, camera);
}

animate(); 