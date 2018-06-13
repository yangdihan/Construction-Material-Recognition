# Construction-Material-Recognition

An autodesk forge extension to backproject images taken on construction project to BIM models on forge viewer. Our work is built on the work from Amir Ibrahim. Our viewer is set up using work by Wilfredo Calderon Torres. The models are uploaded using modelderivative-nodejs-tutorial-master. The theoretical origin of our work is inspired by the Kevin Han.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

1) Register an app on autodesk forge viewer to secure clientID and clientSecret, refer to https://developer.autodesk.com/en/docs/oauth/v2/tutorials/create-app/

2) Secure bucket key with Oauth transaction, refer to <br />
https://developer.autodesk.com/en/docs/data/v2/tutorials/upload-file/

### Installing

A step by step series of examples that tell you how to get a development env running

1) Clone Construction-Material-Recognition to local repo 
```
git git@github.com:yangdihan/Construction-Material-Recognition.git
```

2) Navigate to local Construction-Material-Recognition folder
```
cd Construction-Material-Recognition
```

3) Install node and node dependencies
```
npm install
```
4) Export clientID and clientSecret into viewer
```
export FORGE_CLIENT_ID=<your clientID>
export FORGE_CLIENT_SECRET=<your clientSecret>
```

4) Run local server 
```
node start.js
```

## Deployment

1) Upload model into bucket by double clicking on the bucket

2) Start backprojection from BIM using myAwsomeExtention button 


## Versioning

Construction-Material-Recognition is currently in beta version


## Authors

* **Dihan Yang** - *Initial work* - https://github.com/yangdihan

* **Yumo Chi** - *Initial work* - https://github.com/yumochi

## Acknowledgments

* Amir Ibrahim
* Wilfredo Torees
* Jacob Lin
