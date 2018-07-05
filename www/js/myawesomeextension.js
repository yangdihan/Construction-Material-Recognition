// *******************************************
// My Awesome Extension
// *******************************************
function MyAwesomeExtension(viewer, options) {
  Autodesk.Viewing.Extension.call(this, viewer, options);
}

MyAwesomeExtension.prototype = Object.create(Autodesk.Viewing.Extension.prototype);
MyAwesomeExtension.prototype.constructor = MyAwesomeExtension;

MyAwesomeExtension.prototype.load = function () {
  if (this.viewer.toolbar) {
    // Toolbar is already available, create the UI
    this.createUI();
  } else {
    // Toolbar hasn't been created yet, wait until we get notification of its creation
    this.onToolbarCreatedBinded = this.onToolbarCreated.bind(this);
    this.viewer.addEventListener(av.TOOLBAR_CREATED_EVENT, this.onToolbarCreatedBinded);
  }
  return true;
};

MyAwesomeExtension.prototype.onToolbarCreated = function () {
  this.viewer.removeEventListener(av.TOOLBAR_CREATED_EVENT, this.onToolbarCreatedBinded);
  this.onToolbarCreatedBinded = null;
  this.createUI();
};

MyAwesomeExtension.prototype.createUI = function () {
  var _this = this;

  // prepare to execute the button action
  var myAwesomeToolbarButton = new Autodesk.Viewing.UI.Button('runMyAwesomeCode');
  myAwesomeToolbarButton.onClick = function (e) {

    // **********************
    //
    //
    // Execute an action here
    //
    //
    // **********************
    let viewer = viewerApp.myCurrentViewer;
    let model = viewer.model;
    let cameraParams = {'height': 311, 'width': 536, 'fov': 66.4941355};

    // fov = 2*arctan(23.6/(18*2))
    // 18mm from exif tag given by Jacob
    // 23.6mm from online

    // testing to move camera to the first camera pose
    // viewerApp.myCurrentViewer.navigation.setView(new THREE.Vector3(21.88064542561721,13.817563731188882,1.6856400787354566),new THREE.Vector3(-45.036478165609594,11.941944398531113,4.577064673806156))
    // viewerApp.myCurrentViewer.navigation.setCameraUpVector(new THREE.Vector3(-0.16401953573392578, -0.26826054116278564,0.9492807139896381))


    var frame_obj = jQuery.getJSON("/cameras.out",function(json){
      // console.log(json);
      // cameraParams.height = frame_obj.responseJSON[0].camera0.Height;
      // cameraParams.width = frame_obj.responseJSON[0].camera0.Width;
      // let focal =  frame_obj.responseJSON[0].camera0['Focal length'];

      // console.log(json);


      // to map cameras.out cameras into registration
      const array = [0.5965101718902588, -0.06093583256006241, -0.008314155973494053, 0, 0.06125907227396965, 0.595889687538147, 0.027738701552152634, 0, 0.00544303935021162, -0.028441766276955605, 0.5989725589752197, 0, -18.273792266845703, 4.099245071411133, -14.949145317077637, 1] // array of transformation matrix
      // assuming camera variable contains camera object created from cameras.out
      const regMat= new THREE.Matrix4().fromArray(array);
      //cameraParams.fov = something;
      let framesList = [];
      let i = 0;
      frame_obj.responseJSON.forEach(function(frame){

        let key = "camera"+i;
        let pos = new THREE.Vector3().fromArray(frame[key].Position);
        let tar = new THREE.Vector3().fromArray(frame[key].LookAt);
        let up = new THREE.Vector3().fromArray(frame[key].Up).normalize();;
        let view = new THREE.Vector3().fromArray(frame[key].View);
        up = up.clone().add(pos);
        // only rotate 
        view.applyMatrix4(regMat);
        tar.applyMatrix4(regMat);
        pos.applyMatrix4(regMat);
        up.applyMatrix4(regMat);
        up.sub(pos).normalize();



        framesList.push({ position:   pos,
                          target:     tar,
                          up:         up,
                          name:       frame[key].Image,
                          translation:frame[key].Translation,
                          rotation:   frame[key].Rotation,
                          scale:      frame[key].Scale,
                          view:       view

                        });
        i += 1;
      })

      let frame_sim = new FramesSimulation(viewer, model, cameraParams);
      // console.log(cameraParams)
      ////////////////////////////////
      frame_sim.setIndexModel()
      // frame_sim.setColorModel()
      frame_sim.setWhiteLight();

      frame_sim.startSimulation(framesList, false,
        (captureData)=>{
          console.log("Rendering frame: " + captureData.name);
        },
        (captures)=>{
          console.log("Exporting");
          frame_sim.exportFrames("test_project",captures);
        });
    });





    // alert('I am an extension');

  };
  // myAwesomeToolbarButton CSS class should be defined on your .css file
  // you may include icons, below is a sample class:
  myAwesomeToolbarButton.addClass('myAwesomeToolbarButton');
  myAwesomeToolbarButton.setToolTip('My Awesome extension');

  // SubToolbar
  this.subToolbar = (this.viewer.toolbar.getControl("MyAppToolbar") ?
    this.viewer.toolbar.getControl("MyAppToolbar") :
    new Autodesk.Viewing.UI.ControlGroup('MyAppToolbar'));
  this.subToolbar.addControl(myAwesomeToolbarButton);

  this.viewer.toolbar.addControl(this.subToolbar);
};

MyAwesomeExtension.prototype.unload = function () {
  this.viewer.toolbar.removeControl(this.subToolbar);
  return true;
};

Autodesk.Viewing.theExtensionManager.registerExtension('MyAwesomeExtension', MyAwesomeExtension);
