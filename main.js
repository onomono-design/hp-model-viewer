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

// Load Google Font
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;500&display=swap';
document.head.appendChild(fontLink);

// Global variables for model management
let loadedModel = null;
let isLoading = false;

// Define available models
const models = {
    'HP-01-TURT': 'https://crunchlabs-ono-cloud.s3.us-west-1.amazonaws.com/HP-01-TURT-GAMEREADY-4.fbx',
    'HP-02-DMNO': 'https://crunchlabs-ono-cloud.s3.us-west-1.amazonaws.com/2025-04-29-HP-02-DMNO-GAMEREAD-SR-WIP.fbx',
    'HP-02-DMNO (Alt)': 'https://storage.googleapis.com/files.3dhubs.com/2025-04-29-HP-02-DMNO-GAMEREAD-SR-WIP.fbx' // Alternative hosting
};

// Default to the TURT model as requested
let currentModelKey = 'HP-01-TURT';
let modelFilename = models[currentModelKey];

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
    controlsPanel.style.maxHeight = '0px'; // Start collapsed
    controlsPanel.style.opacity = '0';
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
    
    // Update toggle icon initial state
    toggleIcon.style.transform = 'rotate(-90deg)';
    
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
    
    // Function to create a dropdown
    function createDropdown(name, label, options, onChange) {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';
        
        const labelEl = document.createElement('label');
        labelEl.style.display = 'block';
        labelEl.style.marginBottom = '5px';
        labelEl.style.fontSize = '13px';
        labelEl.htmlFor = name;
        labelEl.textContent = label;
        
        const select = document.createElement('select');
        select.id = name;
        select.style.width = '100%';
        select.style.padding = '8px';
        select.style.backgroundColor = '#444';
        select.style.border = 'none';
        select.style.borderRadius = '4px';
        select.style.color = 'white';
        select.style.fontFamily = '"Martian Mono Condensed", monospace';
        select.style.fontSize = '13px';
        
        // Add options to the dropdown
        for (const [key, value] of Object.entries(options)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            select.appendChild(option);
        }
        
        // Set up event listener
        select.addEventListener('change', onChange);
        
        container.appendChild(labelEl);
        container.appendChild(select);
        
        return { container, select };
    }
    
    // Create model dropdown
    const modelDropdown = createDropdown('modelSelect', 'Select Model', models, (event) => {
        currentModelKey = event.target.value;
        modelFilename = models[currentModelKey];
        modelLabel.textContent = currentModelKey;
        loadModel(true);
    });
    
    // Set initial dropdown value
    modelDropdown.select.value = currentModelKey;
    
    // Opacity slider
    const opacity = createSlider('opacity', 'Wireframe Opacity', 0, 100, 45);
    
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
    modelLabel.textContent = currentModelKey;
    
    // Add model label to panel (put it at the top of the panel)
    controlsPanel.insertBefore(modelLabel, controlsPanel.firstChild);
    
    // Add rendering mode dropdown (before opacity control)
    const renderingMode = addRenderingModeDropdown(controlsPanel);
    
    // Add all controls to the panel
    controlsPanel.appendChild(modelDropdown.container);
    controlsPanel.appendChild(renderingMode.container);
    controlsPanel.appendChild(opacity.container);
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
        bgColorPicker: bgColor.picker,
        zoomSlider: zoom.slider,
        zoomValue: zoom.valueDisplay,
        cameraHeightSlider: camHeight.slider,
        cameraHeightValue: camHeight.valueDisplay,
        rotationSpeedSlider: rotSpeed.slider,
        rotationSpeedValue: rotSpeed.valueDisplay,
        modelDropdown: modelDropdown.select,
        modelLabel: modelLabel,
        retryButton: retryButton,
        renderingModeDropdown: renderingMode.select
    };
}

const uiControls = createUI();

// Add a visible error display
function createErrorDisplay() {
    const errorBox = document.createElement('div');
    errorBox.id = 'error-display';
    errorBox.style.position = 'absolute';
    errorBox.style.bottom = '70px';
    errorBox.style.left = '20px';
    errorBox.style.right = '20px';
    errorBox.style.padding = '10px';
    errorBox.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
    errorBox.style.color = 'white';
    errorBox.style.fontFamily = '"Martian Mono Condensed", monospace';
    errorBox.style.fontSize = '14px';
    errorBox.style.zIndex = '1000';
    errorBox.style.display = 'none';
    errorBox.style.borderRadius = '5px';
    errorBox.style.maxHeight = '150px';
    errorBox.style.overflow = 'auto';
    
    document.body.appendChild(errorBox);
    
    return errorBox;
}

const errorDisplay = createErrorDisplay();

// Update log function to show errors in the display
function logMessage(message) {
    // Enable logging for debugging
    console.log(message);
    
    // Don't show errors in the error element
    /*
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
        const errorElement = document.getElementById('error');
        if (errorElement) {
            errorElement.style.display = 'block';
            errorElement.innerHTML = message;
            errorElement.style.backgroundColor = 'rgba(255,0,0,0.7)';
        }
    }
    */
    
    // Only log to console, don't show on UI
    if (!message.toLowerCase().includes('error') && !message.toLowerCase().includes('failed')) {
        statusElement.textContent = message;
        statusElement.style.display = 'block';
    } else {
        // Hide status element for errors
        statusElement.style.display = 'none';
    }
    
    // Don't show errors in the error display
    /*
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
        errorDisplay.textContent = message;
        errorDisplay.style.display = 'block';
    }
    */
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
        // Update to 100%
        updateProgress(100);
        
        // Show success message
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

// Function to center and scale model appropriately
function centerAndScaleModel(model) {
    // Reset scale and position first
    if (currentModelKey === 'HP-02-DMNO') {
        // Set a smaller scale for the DMNO model which is larger
        model.scale.set(0.01, 0.01, 0.01);
    } else {
        model.scale.set(0.02, 0.02, 0.02);
    }
    model.position.set(0, 0, 0);
    
    // Get the bounding box to find the model dimensions
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    // Log model properties for debugging
    logMessage(`Model size: ${JSON.stringify(size)}`);
    logMessage(`Model center: ${JSON.stringify(center)}`);
    
    // Adjust model position to center it at origin
    model.position.set(-center.x, -center.y, -center.z);
    
    // Additional scaling adjustments if needed
    if (currentModelKey === 'HP-02-DMNO') {
        // May need to adjust Y position if model is not centered properly
        model.position.y += 0.5; // Adjust as needed based on testing
    }
}

// Function to load the model
function loadModel(isRetry = false) {
    if (isLoading && !isRetry) return;
    
    isLoading = true;
    
    // Don't display the error element
    const errorElement = document.getElementById('error');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
    
    // Create or reset loading overlay
    const loadingOverlay = createLoadingOverlay();
    
    if (isRetry) {
        if (loadedModel) {
            scene.remove(loadedModel);
            loadedModel = null;
        }
        logMessage('Retrying model load...');
    }
    
    // Show initial status
    logMessage(`Attempting to load model: ${currentModelKey} from ${modelFilename}`);
    loadingOverlay.statusText.textContent = 'INITIALIZING LOADER...';
    
    // First try a fetch to test if the URL is accessible
    fetch(modelFilename, { method: 'HEAD' })
        .then(response => {
            if (!response.ok) {
                const errorMsg = `Cannot access model file: ${response.status} ${response.statusText}`;
                logMessage(errorMsg);
                throw new Error(errorMsg);
            }
            
            return true;
        })
        .catch(error => {
            logMessage(`Error accessing model URL: ${error.message}`);
            
            // Fall back to TURT model if fetch fails
            if (currentModelKey !== 'HP-01-TURT') {
                currentModelKey = 'HP-01-TURT';
                modelFilename = models[currentModelKey];
                logMessage(`Falling back to TURT model: ${modelFilename}`);
                loadModel(true);
                return;
            }
        })
        .then(canAccess => {
            if (!canAccess) return;
            
            try {
                // Continue with the rest of the loading process
                // Create loader with better error handling
                const loadManager = new THREE.LoadingManager();
                
                // Configure loading manager with detailed callbacks
                loadManager.onStart = (url, itemsLoaded, itemsTotal) => {
                    logMessage(`Started loading: ${url}`);
                    loadingOverlay.statusText.textContent = 'STARTED LOADING MODEL';
                };
                
                loadManager.onProgress = (url, loaded, total) => {
                    const percent = total ? Math.round((loaded / total) * 100) : 0;
                    logMessage(`Loading progress: ${percent}% (${loaded} / ${total || 'unknown'} bytes)`);
                    
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
                    const errorMsg = `Error loading: ${url}`;
                    console.error(errorMsg);
                    logMessage(errorMsg);
                    loadingOverlay.statusText.textContent = 'ERROR LOADING MODEL';
                    isLoading = false;
                };
                
                loadManager.onLoad = () => {
                    logMessage('Loading manager reports complete load');
                };
                
                // Create FBX loader with the configured manager
                const fbxLoader = new FBXLoader(loadManager);
                
                // Add a timeout to handle stalled loading
                const timeoutDuration = 30000; // 30 seconds for all models
                const loadingTimeout = setTimeout(() => {
                    if (isLoading) {
                        const timeoutMsg = `Loading timed out after ${timeoutDuration/1000} seconds`;
                        console.error(timeoutMsg);
                        logMessage(timeoutMsg);
                        loadingOverlay.statusText.textContent = 'LOADING TIMED OUT - TRY AGAIN';
                        isLoading = false;
                    }
                }, timeoutDuration);
                
                // Load the model directly
                logMessage(`Starting FBX load for ${modelFilename}`);
                loadingOverlay.statusText.textContent = 'LOADING MODEL...';
                
                fbxLoader.load(
                    modelFilename,
                    // onLoad callback
                    (fbx) => {
                        clearTimeout(loadingTimeout);
                        
                        logMessage('Model loaded successfully!');
                        loadingOverlay.showSuccess();
                        
                        try {
                            // Use the center and scale function
                            centerAndScaleModel(fbx);
                            
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
                        } catch (processingError) {
                            console.error('Error processing loaded model:', processingError);
                            logMessage(`Error processing model: ${processingError.message}`);
                            loadingOverlay.statusText.textContent = 'ERROR PROCESSING MODEL';
                            isLoading = false;
                        }
                    },
                    // onProgress callback
                    (xhr) => {
                        // Calculate percentage, handling cases where total might be 0
                        let percentComplete = 0;
                        if (xhr.total > 0) {
                            percentComplete = Math.round(xhr.loaded / xhr.total * 100);
                        } else if (xhr.loaded > 0) {
                            // If total is unknown but we have loaded bytes, show progress based on estimated file size
                            const estimatedTotal = 5000000; // 5MB estimated size
                            percentComplete = Math.min(Math.round(xhr.loaded / estimatedTotal * 100), 99);
                        }
                        
                        logMessage(`Loading progress: ${percentComplete}% (${xhr.loaded} bytes downloaded)`);
                        
                        // Update the loading overlay with progress
                        if (loadingOverlay && loadingOverlay.updateProgress) {
                            loadingOverlay.updateProgress(percentComplete);
                        }
                    },
                    // onError callback
                    (error) => {
                        clearTimeout(loadingTimeout);
                        console.error('Error loading model:', error);
                        logMessage(`Error loading model: ${error.message || error}`);
                        loadingOverlay.statusText.textContent = 'ERROR LOADING MODEL';
                        isLoading = false;
                    }
                );
            } catch (loaderError) {
                console.error('Error setting up model loader:', loaderError);
                logMessage(`Error setting up loader: ${loaderError.message}`);
                loadingOverlay.statusText.textContent = 'LOADER INITIALIZATION ERROR';
                isLoading = false;
            }
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

// Function to apply outline effect that only shows edges facing the camera
function applyOutlineEffect(model) {
    logMessage('Applying camera-facing outline effect');
    
    // Remove previous outlines if they exist
    if (model.userData.outlineGroup) {
        model.remove(model.userData.outlineGroup);
    }
    
    // Create a group to hold all outline objects
    const outlineGroup = new THREE.Group();
    
    // Set up outline color (white by default)
    const outlineColor = new THREE.Color(0xffffff);
    
    // Define the outline material shader
    const outlineMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: outlineColor },
            opacity: { value: 0.8 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float opacity;
            
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            
            void main() {
                // Calculate view direction (normalized)
                vec3 viewDir = normalize(vViewPosition);
                
                // Calculate facing ratio (dot product of normal and view direction)
                float facingRatio = abs(dot(vNormal, viewDir));
                
                // Outline effect - only show edges facing the camera
                // Higher power creates sharper outline
                float outline = pow(1.0 - facingRatio, 3.0);
                
                if (outline < 0.3) {
                    discard; // Discard fragments not at the edges
                }
                
                gl_FragColor = vec4(color, opacity * outline);
            }
        `,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false
    });
    
    // Store reference for later updates
    model.userData.outlineMaterial = outlineMaterial;
    
    // Process all meshes
    model.traverse((child) => {
        if (child.isMesh) {
            logMessage(`Processing mesh: ${child.name} - applying outline effect`);
            
            // Create a clone of the mesh for the outline
            const outlineMesh = new THREE.Mesh(child.geometry, outlineMaterial);
            
            // Copy the mesh's position/rotation/scale
            outlineMesh.position.copy(child.position);
            outlineMesh.rotation.copy(child.rotation);
            outlineMesh.scale.copy(child.scale);
            outlineMesh.matrix.copy(child.matrix);
            outlineMesh.matrixWorld.copy(child.matrixWorld);
            
            // Add to the group
            outlineGroup.add(outlineMesh);
        }
    });
    
    // Add the outline group to the model
    model.add(outlineGroup);
    
    // Store the outline group for later reference
    model.userData.outlineGroup = outlineGroup;
    
    return outlineGroup;
}

// Create mode dropdown for rendering mode selection
function addRenderingModeDropdown(controlsPanel) {
    const container = document.createElement('div');
    container.style.marginBottom = '15px';
    
    const labelEl = document.createElement('label');
    labelEl.style.display = 'block';
    labelEl.style.marginBottom = '5px';
    labelEl.style.fontSize = '13px';
    labelEl.textContent = 'Rendering Mode';
    
    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.padding = '8px';
    select.style.backgroundColor = '#444';
    select.style.border = 'none';
    select.style.borderRadius = '4px';
    select.style.color = 'white';
    select.style.fontFamily = '"Martian Mono Condensed", monospace';
    select.style.fontSize = '13px';
    
    // Add options
    const options = [
        { value: 'wireframe', text: 'Wireframe (Original)' },
        { value: 'outline', text: 'Outline (Camera-Facing)' }
    ];
    
    options.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.text;
        select.appendChild(optionEl);
    });
    
    // Set up event listener
    select.addEventListener('change', (event) => {
        if (!loadedModel) return;
        
        const mode = event.target.value;
        
        if (mode === 'wireframe') {
            // Show the wireframe, hide the outline
            if (loadedModel.userData.edgesGroup) {
                loadedModel.userData.edgesGroup.visible = true;
            }
            if (loadedModel.userData.outlineGroup) {
                loadedModel.userData.outlineGroup.visible = false;
            }
        } else if (mode === 'outline') {
            // Hide the wireframe, show the outline
            if (loadedModel.userData.edgesGroup) {
                loadedModel.userData.edgesGroup.visible = false;
            }
            
            // Create outline effect if it doesn't exist
            if (!loadedModel.userData.outlineGroup) {
                applyOutlineEffect(loadedModel);
            } else {
                loadedModel.userData.outlineGroup.visible = true;
            }
        }
    });
    
    container.appendChild(labelEl);
    container.appendChild(select);
    
    controlsPanel.appendChild(container);
    
    return { container, select };
}

// Update opacity based on the slider
uiControls.opacitySlider.addEventListener('input', (event) => {
    if (!loadedModel) return;
    
    const opacity = parseInt(event.target.value) / 100;
    
    // Update wireframe opacity if it exists
    if (loadedModel.userData.wireframeMaterial) {
        loadedModel.userData.wireframeMaterial.opacity = opacity;
    }
    
    // Update outline opacity if it exists
    if (loadedModel.userData.outlineMaterial) {
        loadedModel.userData.outlineMaterial.uniforms.opacity.value = opacity;
    }
    
    uiControls.opacityValue.textContent = `${event.target.value}%`;
});

// Update background color
uiControls.bgColorPicker.addEventListener('input', (event) => {
    // Set the scene background color
    const bgColor = new THREE.Color(event.target.value);
    scene.background = bgColor;
    
    // Set the outline/wireframe color to be the inverse for better contrast
    const invertedColor = new THREE.Color(
        1.0 - bgColor.r, 
        1.0 - bgColor.g, 
        1.0 - bgColor.b
    );
    
    // Update wireframe color if it exists
    if (loadedModel && loadedModel.userData.wireframeMaterial) {
        loadedModel.userData.wireframeMaterial.color = invertedColor;
    }
    
    // Update outline color if it exists
    if (loadedModel && loadedModel.userData.outlineMaterial) {
        loadedModel.userData.outlineMaterial.uniforms.color.value = invertedColor;
    }
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

// Add touch event handlers for mobile
renderer.domElement.addEventListener('touchstart', () => {
    userInteracting = true;
    autoRotate = false;
});

renderer.domElement.addEventListener('touchend', () => {
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

// Test loading the TURT model specifically to check for issues
function testTURTModelLoading() {
    logMessage('Testing TURT model loading directly...');
    
    // Create a test loading manager
    const testManager = new THREE.LoadingManager();
    testManager.onStart = (url) => {
        console.log(`[TEST] Started loading: ${url}`);
        logMessage(`[TEST] Started loading TURT file`);
    };
    
    testManager.onProgress = (url, loaded, total) => {
        console.log(`[TEST] Progress: ${loaded}/${total || 'unknown'}`);
    };
    
    testManager.onLoad = () => {
        console.log('[TEST] Successfully loaded TURT model');
        logMessage('[TEST] TURT model load succeeded');
    };
    
    testManager.onError = (url) => {
        console.error(`[TEST] Failed to load: ${url}`);
        logMessage('[TEST] TURT model load failed');
    };
    
    const testLoader = new FBXLoader(testManager);
    const testUrl = models['HP-01-TURT'];
    
    // Try direct loading
    try {
        logMessage(`[TEST] Attempting to load: ${testUrl}`);
        console.log(`[TEST] Attempting to fetch ${testUrl}`);
        
        // First try a fetch to test the URL
        fetch(testUrl, { method: 'HEAD' })
            .then(response => {
                if (!response.ok) {
                    console.error(`[TEST] Fetch failed with status: ${response.status}`);
                    logMessage(`[TEST] Cannot access TURT model file: ${response.status}`);
                    return;
                }
                
                console.log(`[TEST] Fetch succeeded, size: ${response.headers.get('content-length')}`);
                logMessage(`[TEST] TURT model file accessible, attempting to load...`);
                
                // If fetch succeeded, try loading the model
                testLoader.load(
                    testUrl,
                    (fbx) => {
                        console.log('[TEST] FBX loaded successfully');
                        logMessage('[TEST] TURT FBX loaded successfully');
                    },
                    (xhr) => {
                        console.log(`[TEST] Loading progress: ${xhr.loaded} bytes`);
                    },
                    (error) => {
                        console.error('[TEST] Error loading FBX:', error);
                        logMessage(`[TEST] Error loading TURT FBX: ${error.message}`);
                    }
                );
            })
            .catch(error => {
                console.error('[TEST] Fetch error:', error);
                logMessage(`[TEST] TURT file fetch error: ${error.message}`);
            });
    } catch (e) {
        console.error('[TEST] Error in test:', e);
        logMessage(`[TEST] TURT test error: ${e.message}`);
    }
}

// Add a button to test TURT model loading
function addTestButton() {
    const testButton = document.createElement('button');
    testButton.textContent = 'Test TURT Load';
    testButton.style.position = 'absolute';
    testButton.style.bottom = '20px';
    testButton.style.right = '20px';
    testButton.style.zIndex = '1000';
    testButton.style.padding = '10px';
    testButton.style.backgroundColor = 'red';
    testButton.style.color = 'white';
    testButton.style.border = 'none';
    testButton.style.borderRadius = '5px';
    testButton.style.cursor = 'pointer';
    
    testButton.addEventListener('click', testTURTModelLoading);
    
    document.body.appendChild(testButton);
}

// Add the test button to the page
// addTestButton(); // Commented out to remove test button 