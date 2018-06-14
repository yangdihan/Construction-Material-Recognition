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
    let cameraParams = {'height': 0, 'width': 0, 'fov': 66.4941355};

    // fov = 2*arctan(23.6/(18*2))
    // 18mm from exif tag given by Jacob
    // 23.6mm from online

    var frame_obj = jQuery.getJSON("/cameras.out",function(json){
      // console.log(json);
      cameraParams.height = frame_obj.responseJSON[0].camera0.Height;
      cameraParams.width = frame_obj.responseJSON[0].camera0.Width;
      // let focal =  frame_obj.responseJSON[0].camera0['Focal length'];

      //cameraParams.fov = something;
      let framesList = [];
      let i = 0
      frame_obj.responseJSON.forEach(function(frame){
        let key = "camera"+i;
        framesList.push({ position:   frame[key].Position, 
                          target:     frame[key].LookAt, 
                          up:         frame[key].Up, 
                          name:       frame[key].Image, 
                          translation:frame[key].Translation,
                          rotation:   frame[key].Rotation,
                          scale:      frame[key].Scale
                        });
        i += 1;
      })
      
      let frame_sim = new FramesSimulation(viewer, model, cameraParams);
      // console.log(cameraParams)
      frame_sim.setIndexModel();
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
