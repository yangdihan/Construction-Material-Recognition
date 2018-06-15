/*============================================================================
 * @author     : Amir Ibrahim (cem.amir@hotmail.com)
 * @file       : FramesSimulation.js
 * @brief      : Handles Simulation of camera frames via model rendering
 * Copyright (c) Amir Ibrahim @ Reconstruct Inc.
 =============================================================================*/
//----------------------------------------------------------------------------//
//                               MODULE IMPORTS                               //
//----------------------------------------------------------------------------//

// import Pubsub from 'pubsub-js';
// import * as Events from 'Events';

// import $ from 'jquery';
// import JSZip from '/packages/jszip/dist/jszip';
// import saveAs from '/packages/save-as/src/lib';

// let $ = require('jquery');
// let Pubsub = require('pubsub');
// let Events = require('events');
// var * = new Events();
// var JSZip = require('/packages/jszip/dist/jszip.js');
// let saveAs = require('save-as');
//----------------------------------------------------------------------------//
//                             END MODULE IMPORTS                             //
//----------------------------------------------------------------------------//
//----------------------------------------------------------------------------//
//                                  VARIABLES                                 //
//----------------------------------------------------------------------------//

//----------------------------------------------------------------------------//
//                                END VARIABLES                               //
//----------------------------------------------------------------------------//
//----------------------------------------------------------------------------//
//                              CLASS DEFINITION                              //
//----------------------------------------------------------------------------//
class FramesSimulation {
  /**
    * Class constructor.
    * @param {AutodeskViewer} viewer - Autodesk viewer instance.
    * @param {Object} model - The BIM model loaded in the viewer.
    * @param {Object} cameraParams - A dictionary containing the parameters of the camera
    *                 to be used for simulation - required keys: [width, height, fov]..
    */
  constructor(viewer, model, cameraParams){
    this._viewer = viewer;
    this._model = model;
    this._cameraParams = cameraParams;
    this._simRunning = false;
    this._simTimer = null;
    this._renderer = null;
    this.fragDict = null;
    this.simModel = null;
    this.occlusionModel = null;
    this.ground = null;
    this.simLight = null;
    this.prefStorage = {};
    this._initialize();
  };

  /**
    * Initialize Simulation class has to be done after the BIM is loaded
    */
  _initialize(){
    this._viewer.impl.createOverlayScene('Visual_Simulation',null,null,this._getCamera());
    this.fragDict = this.getFragDictionary();
    this._setupRenderer();
  }

  /**
    * setup the renderer for backprojection
    */
  _setupRenderer(){
    this._renderer = this._viewer.impl.glrenderer();
    let height = this._cameraParams.height;
    let width = this._cameraParams.width;
    let customSize = {
      height: height,
      width: width,
      // y: Math.round(window.innerHeight/2 - height/2),
      // x: Math.round(window.innerWidth/2 - width/2)
      y: Math.round(this._viewer.impl.glrenderer().context.canvas.style.height/2 - height/2),
      x: Math.round(this._viewer.impl.glrenderer().context.canvas.style.width/2 - width/2)
    }
    this._renderer.customSize = customSize;
  }

  /**
    * Start simulation
    * @param {Object[]} framesList - An List of frames, each frame is defined as an object with
    *                                the keys: [name, position, target, up, gps]
    * @param {boolean} separateElements - whether to render each element of the model separately
    * @param {callback} onRenderFunction - Execute a callback after each render, frame data is passed
    * @param {callback} onCompleteFunction - Execute a callback after simulation is ended, frame data is passed
    */
  startSimulation(framesList, separateElements, onRenderFunction, onCompleteFunction){
    if(this._simRunning){
      throw new Error("Cannot start new simulation before prev. one is finished")
    }
    this._simRunning = true;
    this._simTimer = Date.now();
    this._viewer.clearSelection();
    // Pubsub.publishSync(Events.POINT_CLOUD_SET_VISIBILITY,false);
    // Pubsub.publishSync(Events.BIM_SET_ALL_ENABLED,false);
    this._viewer.setEnvMapBackground(false);
    this._viewer.setBackgroundColor(0,0,0);
    this.toggleSceneObjects(true);
    let cam = this._getCamera();
    this.prefStorage.camPosition = cam.position.clone();
    this.prefStorage.camTarget = cam.target.clone();
    this.prefStorage.camUp = cam.up.clone();
    this.prefStorage.camPerspective = cam.isPerspective;
    this.prefStorage.camFOV = this._viewer.navigation.getVerticalFov();
    this._viewer.navigation.setVerticalFov(this._cameraParams.fov, false);
    this._viewer.navigation.toPerspective();
    this._resizeRenderer(true);
    this._refreshRenderer();

    // recursive structure to retreive images
    this._syncTimeout(30).then(()=>{

      let captures = [];
      this._getFrames(framesList, 0, captures, separateElements, onRenderFunction, onCompleteFunction);
    });
  }

  /**
    * Revert to previous state of the viewer after simulation
    */
  endSimulation(){
    this._viewer.impl.setLightPreset(this._viewer.impl.currentLightPreset(),true);
    // let pcVisible = $('#pointcloud-visible').hasClass("is-checked");
    // Pubsub.publishSync(Events.POINT_CLOUD_SET_VISIBILITY,pcVisible);
    // let bimVisible = $('#bim-visible').hasClass("is-checked");
    // Pubsub.publishSync(Events.BIM_SET_ALL_ENABLED,bimVisible);
    this.toggleSceneObjects(false);
    let cam = this._getCamera();
    cam.position.copy(this.prefStorage.camPosition);
    cam.target.copy(this.prefStorage.camTarget);
    cam.up.copy(this.prefStorage.camUp);
    cam.dirty = true;
    this._viewer.navigation.setVerticalFov(this.prefStorage.camFOV,false);
    if(!this.prefStorage.camPerspective){
      this._viewer.navigation.toOrthographic();
    }
    this.prefStorage.camPosition = null;
    this.prefStorage.camTarget = null;
    this.prefStorage.camUp = null;
    this.prefStorage.camPerspective = null;
    this.prefStorage.camFOV = null;
    this._resizeRenderer(false);
    this._refreshRenderer();
    this._simRunning = false;
  }

  /**
    * stops the simulation during running
    */
  stopSimulation(){
    console.log("Force stopping the current simulation")
    this._simRunning = false;
    this.endSimulation();
  }

  /**
    * Start simulation
    * @param {Object[]} framesList - A list of frames, each frame is defined as an object with
    *                                the keys: [name, position, target, up, gps]
    * @param {number} currentIndex - The current frame index
    * @param {Object[]} captures - A list of captures data, used to store captures through recursion
    * @param {boolean} separateElements - whether to render each element of the model separately
    * @param {callback} onRenderFunction - Execute a callback after each render, frame data is passed
    * @param {callback} onCompleteFunction - Execute a callback after simulation is ended, frame data is passed
    */
  _getFrames(framesList, currentIndex, captures, separateElements, onRenderFunction, onCompleteFunction){

    if(!this._simRunning){
      this.endSimulation()
      return
    }

    let frame = framesList[currentIndex];
    // console.log(frame)


    // let cam = this._getCamera();
    let cam = this._getCamera();


    let pos = new THREE.Vector3().fromArray(frame.position);
    let tar = new THREE.Vector3().fromArray(frame.target)
    let up = new THREE.Vector3().fromArray(frame.up)
    let trans = new THREE.Vector3().fromArray(frame.translation);
    let rotate = new THREE.Matrix3().fromArray(frame.rotation);
    let scale = frame.scale;

    // let cam = {position:pos, target:tar, up:up, dirty:true};
    // let basis = new THREE.Matrix4.makeBasis()
                        
    // console.log(cam.fov)
    cam.position.copy(pos); // this line makes model flash disappear in viewer
    // because this copy changed the param of viewer default cam obj
    cam.target.copy(tar);
    cam.up.copy(up);
    cam.fov = this._cameraParams.fov;
    cam.rotation.copy(rotate)
    cam.scale.copy(new THREE.Vector3(scale, scale, scale));
    cam.dirty = true;

    this._syncTimeout(30).then(()=>{
      if(separateElements){
        for(let fid in this.simModel.idToMesh){
          this._occludeElement(fid);
          let pixelData = this._readPixels();
          let sum = pixelData.reduce((accumulator, currentValue) =>{
            accumulator + currentValue
          });
          if(sum-255*pixelData.length/4 > 0){   //check if the frame includes any element
            console.log("Element detected: "+fid);
            // let frameData = {name:frame.name+"_"+fid, data: pixelData, gps: frame.gps}
            let frameData = {name:frame.name+"_"+fid, data: pixelData}
            captures.push(frameData);
          }
        }
      }else{
        // let frameData = {name:frame.name, data:this._readPixels(), gps: frame.gps}
        let frameData = {name:frame.name, data:this._readPixels()}

        // console.log(this._viewer.impl.glrenderer())
        // console.log(this._renderer)
        // debugger

        captures.push(frameData);

        if(onRenderFunction){
          onRenderFunction(frameData);
        }
      }
      console.log("Pixels data retrieved for frame: " + frame.name);

      if(currentIndex+1<framesList.length){     // Recurse in waypoints if there are still waypoints in the mission
        this._getFrames(framesList, currentIndex+1, captures, separateElements, onRenderFunction, onCompleteFunction)
      }else{    // Exit recursion
        this.endSimulation();
        if(onCompleteFunction){
          onCompleteFunction(captures)
        }
      }
    });
  }

  /**
    * Only show the visible part of an element
    *@param {number} fragId - fragment Id of the element to be occluded
    */
  _occludeElement(fragId){
    if(!this.occlusionModel){
      this.setOcclusionModel();
      console.warn("Occlusion model was created automatically to separate backprojected elements");
    }
    for(let fid in this.occlusionModel.idToMesh){
      this.occlusionModel.idToMesh[fid].visible = true;
    }
    for(let fid in this.simModel.idToMesh){
      this.simModel.idToMesh[fid].visible = false;
    }
    this.occlusionModel.idToMesh[fragId].visible = false;
    this.simModel.idToMesh[fragId].visible = true;
  }

  /**
    * Read the rendered pixels
    *@return {number[]} Array of pixel data in the format [R,G,B,A, ...]
    */
  _readPixels(){
    let renderer = this._renderer;
    let gl = renderer.getContext();
    let scene = this._getScene("Visual_Simulation");
    let camera = this._getCamera();
    // let camera = cam;
    renderer.clear();
    renderer.render(scene, camera);
    let renderSize = renderer.customSize;
    var pixels = new Uint8Array(renderSize.width*renderSize.height*4);
    gl.readPixels(renderSize.x, renderSize.y, renderSize.width, renderSize.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels.slice(0);
  }

  /**
    * sets a new index model to the scene
    * @param {boolean} visible - Whether the model is initially visible [default=false]
    */
  setIndexModel(visible=false){
    this._setModel("index", visible);
  }

  /**
    * sets a new single color model to the scene
    * @param {hex} color - color of the model in hexadecimal format
    * @param {boolean} visible - Whether the model is initially visible [default=false]
    */
  setColorModel(color, visible=false){
    var material = new THREE.MeshBasicMaterial({color: color, side: THREE.DoubleSide});
    this._setModel("color", visible, material);
  }

  /**
    * sets a new single color model to the scene
    * @param {hex} color - color of the model in hexadecimal format
    * @param {boolean} visible - Whether the model is initially visible [default=false]
    * @return {Three.Object3D} - Returns a reference to the added model
    */
  addColorModel(color, visible=false){
    var material = new THREE.MeshBasicMaterial({color: color, side: THREE.DoubleSide});
    let model = this._getModel("color", material);
    model.visible = visible;
    this._addObjectToScene(model);
    return model;
  }

  /**
    * sets a new ground in the scene
    * @param {string} textureURI - URI for the texture to be loaded, if undefined the ground is removed
    * @param {THREE.Vector3} position - the position of the center of the ground
    * @param {boolean} visible - Whether the ground is initially visible [default=false]
    * @return {Promise} Promise that resolves when the ground is created
    */
  setGround(textureURI, position, visible=false){
    if(this.ground){
      console.warn("Ground removed");
      this._removeObjectFromScene(this.ground);
    }
    if(!textureURI){
      return Promise.resolve(true);
    }
    return new Promise((res,rej)=>{
      new THREE.TextureLoader().load(textureURI,(texture)=>{
        texture.wrapS = THREE.MirroredRepeatWrapping;
        texture.wrapT = THREE.MirroredRepeatWrapping;
        var geometry = new THREE.PlaneGeometry( 1000, 1000);
        var material = new THREE.MeshBasicMaterial({map:texture})
        var mesh = new THREE.Mesh( geometry, material );
        mesh.position.copy(position);
        this._addObjectToScene(mesh);
        this.ground = mesh;
        this._refreshScene();
        res(true);
      },
      null,
      (error)=>{
          rej(error);
      });
    });
  }

  /**
    * sets a texture to the roof elements
    * @param {string} textureURI - URI for the texture to be loaded, if undefined the roof texture will not be adjusted
    * @return {Promise} Promise that resolves when the roof texture is changed
    */
  setRoofTexture(textureURI){
    if(!textureURI){
      return Promise.resolve(true)
    }
    return new Promise((res,rej)=>{
      new THREE.TextureLoader().load(textureURI,(texture)=>{
        texture.wrapS = THREE.MirroredRepeatWrapping;
        texture.wrapT = THREE.MirroredRepeatWrapping;
        for(var fragId in this.simModel.idToMesh){
          let dbId = this.fragDict[fragId];
          let name = this.getElementName(dbId);
          let checked = this.checkElementInFilter(name,new Set(["roof"]));
          if(checked){
            let faces = this._getFragmentFaces(fragId);
            let object = new THREE.Object3D();
            faces.map((geom)=>{
              var geom = new THREE.PlaneGeometry( 10000, 10000);
              var material = new THREE.MeshBasicMaterial({map:texture});
              var mesh = new THREE.Mesh(geom,material);
              object.add(mesh);
            });
            this.simModel.add(object);
            this.simModel.remove(this.simModel.idToMesh[fragId])
            this.simModel.idToMesh[fragId] = object;
          }
        }
        res(true)
      },
      null,
      (error)=>{
          rej(error);
      });
    });
  }

  /**
    * sets a new clone to the BIM model to the scene
    * @param {boolean} visible - Whether the model is initially visible [default=false]
    */
  setOriginalModel(roofTextureURI, visible=false){
    this._setModel("original", visible);
    if(roofTextureURI){
      return this.setRoofTexture(roofTextureURI);
    }
  }

  /**
    * sets a new texture model to the scene
    * @param {string} textureURI - server uri for loading the texture
    * @param {boolean} visible - Whether the model is initially visible [default=false]
    */
  setTextureModel(textureURI, visible=false){
    // TODO - not working for now, texture should be served by the server
    throw new Error("Texture materials are not yet supported!")
    return
    var texture = new THREE.TextureLoader().load(textureURI);
    var material = new THREE.MeshBasicMaterial( {map: texture} );
    this._setModel("texture", visible, material);
  }

  /**
    * sets a new occlussion model to the scene, have to be called if BIM elements are simulated separately
    */
  setOcclusionModel(){
    var material = new THREE.MeshBasicMaterial({color: 0x000000, side: THREE.DoubleSide});
    this._setModel("occlusion", visible, material);
  }

  /**
    * Sets a certain model for simulation according to the application
    * @param {string} type - the type of the model.
    * @param {boolean} visible - Whether the model is initially visible.
    * @param {Object} option - Initialization option for the model.
    */
  _setModel(type, visible, option){
    var model = (type == "occlusion")?this.occlusionModel:this.simModel;
    if(model){
      console.warn("Duplicate model detected and removed");
      this._removeObjectFromScene(model);
    }
    model = this._getModel(type, option);
    console.log("New simulation model created of type: "+ type);
    if(type == "occlusion"){
      model.children.map((ch)=>{
        ch.visible = false;
      });
      this.occlusionModel = model;
    }else{
      model.visible = visible;
      this.simModel = model;
    }
    this._addObjectToScene(model);
  }

  /**
    * Retruns a certain model for simulation according to the application
    * @param {string} type - the type of the model.
    * @param {Object} option - Initialization option for the model.
    * @return {Three.Object3D} - The Model
    */
  _getModel(type, option){
    if(this.fragDict == null){
      console.warn("fragments dictionary is not constructed, reinitializing!");
      this.fragDict = this.getFragDictionary();
    }
    let model = new THREE.Object3D();
    model.idToMesh = {};
    for(let fragId in this.fragDict){
      let renderProxy = this._getRenderProxy(fragId);
      var material;
      if(type == "original"){
        var mesh = renderProxy.clone();
      }else{
        if(type == "index"){
          let colorInt = Number(fragId)+1;
          material = new THREE.MeshBasicMaterial({color: colorInt,side: THREE.DoubleSide});
        }else if(type == "color" || type == "texture"){
          material = option.clone();    //in this case the option is a material
        }else{
          throw new Error("Model type is not supported")
          return
        }
        var mesh = new THREE.Mesh(renderProxy.geometry, material);
      }
      mesh.matrix.copy(renderProxy.matrixWorld);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      model.add(mesh);
      model.idToMesh[fragId] = mesh;
    }
    return model;
  }

  /**
    * Sets a new white ambient light to the scene
    * @param {boolean} visible - Whether the light is initially visible [default=false]
    */
  setWhiteLight(visible=false){
    this._setAmbientLight(visible, 0xffffff);
  }

  /**
    * Add a certain ambient light for the simulation
    * @param {boolean} visible - Whether the light is initially visible.
    * @param {hex} color - Name identifier for the light.
    */
  _setAmbientLight(visible, color){
    if(this.simLight){
      console.warn("Duplicate light detected and removed");
      this._removeObjectFromScene(this.simLight);
      this.simLight = null;
    }
    console.log("Creating new simulation light of color: "+ color);
    var light = new THREE.AmbientLight(color);
    light.visible = visible;
    this._addObjectToScene(light);
    this.simLight = light;
  }

  /**
    * Toggle the visiblity of a scene object
    * @param {string} name - Name identifier for the model.
    * @param {boolean} visible - Whether the object is visible.
    */
  toggleSceneObjects(visible){
    this.simModel.visible = visible;
    this.simLight.visible = visible;
    if(this.ground){
      this.ground.visible = visible;
    }
  }

  /**
    * Download screen captures and output them in a zip format.
    * @param {string} name - Name of the zip file.
    * @param {Object[]} captures - A list of captures, each capture is defined by the keys [name, data].
    */
  exportFrames(name, captures){
    if(this.simRunning){
      throw new Error("Cannot start export simulation while still processing!");
      return
    }
    var zip = new JSZip();
    // var jsonData = {};
    const canvas = document.createElement('canvas');
    const width = this._renderer.customSize.width;
    const height = this._renderer.customSize.height;
    canvas.id = "temp";
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    for(let capture of captures){
      var imageData = ctx.createImageData(width,height);
      const L = capture.data.length-1;
      // Since the capture data starts from lower left but canvas draws from top left,
      // we have to reverse the pixels
      for(var i=0; i<L; i+=4){
        imageData.data[L-i-3] = capture.data[i];
        imageData.data[L-i-2] = capture.data[i+1];
        imageData.data[L-i-1] = capture.data[i+2];
        imageData.data[L-i] = capture.data[i+3];
      }
      ctx.putImageData(imageData, 0, 0);
      var data = canvas.toDataURL("image/jpeg");
      // let fileName = capture.name + '.jpeg';
      let fileName = capture.name;
      zip.file(fileName, data.split(',')[1],{base64: true});
      // jsonData[fileName] = capture.gps;
    }
    // zip.file('data.json', JSON.stringify(jsonData));
    zip.generateAsync({type:"blob"}).then((content)=>{
      saveAs(content, name+".zip");
    });
  }

  /**
    * Resizes the current renderer for simulation in smaller scale
    * @param {boolean} customSize Whether resizing for simulation or back to normal size.
    */
  _resizeRenderer(customSize = true){
    console.log(this._renderer.customSize)
    if(customSize){
      const size = this._renderer.customSize;
      this._renderer.setViewport(size.x, size.y, size.width, size.height);
    }else{
      this._renderer.setViewport(0, 0, this._viewer.impl.glrenderer().context.canvas.style.width, this._viewer.impl.glrenderer().context.canvas.style.height);
    }
  }

  /**
   * get a dictionary that maps fragIds to dbIds, the dictionray can also
   * be used to iterate the fragIds
   * @param {string[]} filterList - A list containing keywords to simulate only elements having them
   *                               if not defined all elements will be simulated
   * @return {{number:number}} a dictionary mapping fragId to dbId
   */
  getFragDictionary(filterList){
   let dict = {};
   let dbIds = this.getDbIds();
   dbIds.forEach((dbId)=>{
     let name = this.getElementName(dbId);
     if(filterList){
       let checked = this.checkElementInFilter(name,filterList);
       if(!checked) return
     }
     let frags = this.getElementFrags(dbId);
     frags.forEach((fragId)=>{
       dict[fragId] = dbId;
     });
   });
   return dict
  }

  /**
   * Get fragements id for an element using dBId.
   * @param {number} dbId - id of the element.
   * @return {number[]} fragment ids for the element.
   */
  getElementFrags(dbId){
   let tree = this._getBIMObject().getData().instanceTree;
   let frags = [];
   tree.enumNodeFragments(dbId, (frag)=>{
     frags.push(Number(frag));
   });
   return frags;
  }

  /**
    * Get name for an element node using dbid.
    * @param {number} dbId - DBId for the element.
    * @return {string} element name.
    */
  getElementName(dbId){
    let tree = this._getBIMObject().getData().instanceTree;
    return tree.getNodeName(dbId);
  }

  /**
    * Check if the element name has at least one of the keywords
    * @param {string} name name of the element
    * @param {string} keywords keywords for filter
    * @return {boolean} if the element should be rendered
    */
  checkElementInFilter(name, keywords){
    let testNames = name.toLowerCase().split(/[ |\-|,]/g);
    var intersection = testNames.filter(x => keywords.has(x));
    return intersection.length > 0;
  }

  /**
    * get DBIds associated with BIM elements, each element will have a specific DBId
    * @return {number[]} an array of all DbIds
    */
  getDbIds(){
    var instanceTree = this._getBIMObject().getData().instanceTree;
    var allDbIds = Object.keys(instanceTree.nodeAccess.dbIdToIndex);
    return allDbIds.map((dbId)=>{
      return Number(dbId);
    });
  }

  /**
    * return BIM model initialize din Forge Viewer
    * @return {Model} BIM model defined by ForgeViewer
    */
  _getBIMObject(){
    return this._model;
  }

  /**
    * Get render proxy for a fragment in the mesh.
    * @param {number} fragId - id of the fragment.
    * @return {Object} Render proxy object relevant to the fragment.
    */
  _getRenderProxy(fragId){
    return this._viewer.impl.getRenderProxy(this._getBIMObject(), fragId);
  }

  /**
    * Get fragment proxy for a fragment in the mesh.
    * @param {number} fragId - id of the fragment.
    * @return {Object} Fragment proxy object relevant to the fragment.
    */
  _getFragementProxy(fragId){
    return this._viewer.impl.getFragmentProxy(this._getBIMObject(), fragId);
  }

  /**
   * Refresh scene, to be called after elements are transformed.
   */
  _refreshScene(){
    this._viewer.impl.invalidate(true, true, true);
  }

  /**
   * Redraw scene, to be called after a change is made to the scene.
   */
  _refreshRenderer(){
   this._viewer.impl.invalidate(true, true, false);
  }

  /**
    * Retrun simulation scene.
    * @param {string} sceneName The name of the overlay scene to retrieve
    * @return {THREE.Scene} Simulation scene.
    */
  _getScene(sceneName){
    return this._viewer.impl.overlayScenes[sceneName].scene;
  }

  /**
    * Retrun viewer camera.
    * @return {THREE.Camera} viewer camera.
    */
  _getCamera(){
    return this._viewer.impl.camera;
  }


  /**
    * Execute a function
    * @param {number} msec - milliseconds to wait before resolving the promise
    *@return {Promise} - A promise that resolves after the defined time
    */
  _syncTimeout(msec){
    return new Promise((res,rej)=>{
      setTimeout(()=>{
        res(true);
      },msec)
    });
  }


  /**
    * Get all faces (triangles) associated with a certain fragement.
    * @param {number} fragId - Fragment Id for an element.
    * @return {THREE.Geometry[]} an array of geometries for the fragment
    */
  _getFragmentFaces(fragId){
    let fragProxy = this._getFragementProxy(fragId);
    let renderProxy = this._getRenderProxy(fragId);
    fragProxy.getAnimTransform();
    let geometry = renderProxy.geometry;
    let attributes = geometry.attributes;
    if (attributes.index == undefined) {
      throw "Fragment "+fragId+" has no data"
      return [];
    }
    let matrix = renderProxy.matrixWorld;
    // index array of the vertices
    let faceIndices = attributes.index.array || geometry.ib;
    // position array of the fragment
    let vertices = geometry.vb ? geometry.vb : attributes.position.array;
    // unit range of the  vertices in the position array
    let stride = geometry.vb ? geometry.vbstride : 3;
    // geometry offset if any
    let offsets = geometry.offsets;

    var faces = [];

    for(var v=0; v<faceIndices.length; v+=3){
      var vA = new THREE.Vector3();
      var vB = new THREE.Vector3();
      var vC = new THREE.Vector3();
      vA.fromArray(vertices, faceIndices[v]*stride);
      vB.fromArray(vertices, faceIndices[v+1]*stride);
      vC.fromArray(vertices, faceIndices[v+2]*stride);
      vA.applyMatrix4(matrix);
      vB.applyMatrix4(matrix);
      vC.applyMatrix4(matrix);

      var geomface = new THREE.Geometry();
      geomface.vertices.push(vA, vB, vC);

      var face = new THREE.Face3(0, 1, 2);
      geomface.faces.push(face);
      geomface.computeBoundingSphere();
      geomface.computeFaceNormals();

      faces.push(geomface);
    }
    return faces;
  }

  /**
    * Destruct the instance of the class to free memory.
    */
  destruct(){
    this._removeObjectFromScene(this.simModel);
    this._removeObjectFromScene(this.simLight);
    this._viewer.impl.removeOverlayScene('Visual_Simulation');
    this.simModel = null;
    this.simLight = null;
    this.prefStorage = {};
  }

  /**
    * Adds an object to the scene.
    * @param {THREE.Object3D} object - object to be added to the scene.
    */
  _addObjectToScene(object){
    this._viewer.impl.addOverlay('Visual_Simulation', object);
    this._refreshScene();
    this._refreshRenderer();
  }

  /**
    * Removes an object from the scene.
    * @param {THREE.Object3D} object - object to be removed from the scene.
    */
  _removeObjectFromScene(object){
    this._viewer.impl.removeOverlay('Visual_Simulation', object);
    this._refreshScene();
    this._refreshRenderer();
  }

}
//----------------------------------------------------------------------------//
//                            END CLASS DEFINITION                            //
//----------------------------------------------------------------------------//
//----------------------------------------------------------------------------//
//                               CLASS EXPORTS                                //
//----------------------------------------------------------------------------//
// export default FramesSimulation;
//----------------------------------------------------------------------------//
//                             END CLASS EXPORTS                              //
//----------------------------------------------------------------------------//
