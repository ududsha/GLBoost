import GLBoost from '../globals'
import GLContext from '../GLContext'
import Geometry from '../Geometry'
import ClassicMaterial from '../ClassicMaterial'
import Mesh from '../Mesh'
import PhongShader from '../shaders/PhongShader'
import Texture from '../textures/Texture'
import Vector3 from '../math/Vector3'
import Vector2 from '../math/Vector2'
import Vector4 from '../math/Vector4'
import Quaternion from '../math/Quaternion'
import ArrayUtil from '../misc/ArrayUtil'

let singleton = Symbol();
let singletonEnforcer = Symbol();

export default class GLTFLoader {

  constructor(enforcer) {
    if (enforcer !== singletonEnforcer) {
      throw new Error("This is a Singleton class. get the instance using 'getInstance' static method.");
    }
  }

  static getInstance() {
    if (!this[singleton]) {
      this[singleton] = new GLTFLoader(singletonEnforcer);
    }
    return this[singleton];
  }

  loadGLTF(url, canvas, scale = 1.0, defaultShader = null) {
    return new Promise((resolve, reject)=> {
      var xmlHttp = new XMLHttpRequest();
      xmlHttp.onreadystatechange = ()=> {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200){
          var gotText = xmlHttp.responseText;
          var partsOfPath = url.split('/');
          var basePath = '';
          for(var i=0; i<partsOfPath.length-1; i++) {
            basePath += partsOfPath[i] + '/';
          }
          console.log(basePath);
          this._constructMesh(gotText, basePath, canvas, scale, defaultShader, resolve);
        }
      };

      xmlHttp.open("GET", url, true);
      xmlHttp.send(null);
    });
  }

  _constructMesh(gotText, basePath, canvas, scale, defaultShader, resolve) {
    var json = JSON.parse(gotText);

    for (let bufferName in json.buffers) {
      //console.log("name: " + bufferName + " data:" + );
      let bufferInfo = json.buffers[bufferName];

      if ( bufferInfo.uri.match(/^data:application\/octet-stream;base64,/) ){
        this._loadBinaryFile(bufferInfo.uri, basePath, json, canvas, scale, defaultShader, resolve);
      } else {
        this._loadBinaryFile(basePath + bufferInfo.uri, basePath, json, canvas, scale, defaultShader, resolve);
      }
    }
  }

  _loadBinaryFile(binaryFilePath, basePath, json, canvas, scale, defaultShader, resolve) {
    var oReq = new XMLHttpRequest();
    oReq.open("GET", binaryFilePath, true);
    oReq.responseType = "arraybuffer";

    var material = new ClassicMaterial(canvas);

    oReq.onload = (oEvent)=> {
      var arrayBuffer = oReq.response; // Note: not oReq.responseText
      var geometry = new Geometry(canvas);
      var mesh = new Mesh(geometry);

      if (arrayBuffer) {

        let meshJson = null;
        for (let mesh in json.meshes) {
          meshJson = json.meshes[mesh];
        }
        let primitiveJson = meshJson.primitives[0];
        let gl = GLContext.getInstance(canvas).gl;

        // Geometry
        let indicesAccessorStr = primitiveJson.indices;
        var indices = this._accessBinary(indicesAccessorStr, json, arrayBuffer, 1.0, gl);

        let positionsAccessorStr = primitiveJson.attributes.POSITION;
        let positions = this._accessBinary(positionsAccessorStr, json, arrayBuffer, scale, gl);

        let normalsAccessorStr = primitiveJson.attributes.NORMAL;
        let normals = this._accessBinary(normalsAccessorStr, json, arrayBuffer, 1.0, gl);

        // Texture
        let texcoords0AccessorStr = primitiveJson.attributes.TEXCOORD_0;
        var texcoords = null;
        var additional = {};

        let materialStr = primitiveJson.material;
        let materialJson = json.materials[materialStr];
        let diffuseValue = materialJson.values.diffuse;
        // Diffuse Texture
        if (texcoords0AccessorStr) {
          texcoords = this._accessBinary(texcoords0AccessorStr, json, arrayBuffer, scale, gl);
          additional['texcoord'] = texcoords;

          if (typeof diffuseValue === 'string') {
            let textureStr = diffuseValue;
            let textureJson = json.textures[textureStr];
            let imageStr = textureJson.source;
            let imageJson = json.images[imageStr];
            let imageFileStr = imageJson.uri;

            var texture = new Texture(basePath + imageFileStr, canvas);
            texture.name = textureStr;
            material.diffuseTexture = texture;
          }
        }
        // Diffuse
        if (diffuseValue && typeof diffuseValue !== 'string') {
          material.diffuseColor = new Vector4(diffuseValue[0], diffuseValue[1], diffuseValue[2], diffuseValue[3]);
        }
        // Ambient
        let ambientValue = materialJson.values.ambient;
        if (ambientValue && typeof ambientValue !== 'string') {
          material.ambientColor = new Vector4(ambientValue[0], ambientValue[1], ambientValue[2], ambientValue[3]);
        }
        // Specular
        let specularValue = materialJson.values.specular;
        if (specularValue && typeof specularValue !== 'string') {
          material.specularColor = new Vector4(specularValue[0], specularValue[1], specularValue[2], specularValue[3]);
        }

        let opacityValue = 1.0 - materialJson.values.transparency;

        var vertexData = {
          position: positions,
          normal: normals
        };

        geometry.setVerticesData(ArrayUtil.merge(vertexData, additional), [indices]);

        // Animation
        let animationJson = null;
        for (let anim in json.animations) {
          animationJson = json.animations[anim];
          if (animationJson) {
            let channelJson = animationJson.channels[0];
            let targetMeshStr = channelJson.target.id;
            let targetPathStr = channelJson.target.path;
            let samplerStr = channelJson.sampler;
            let samplerJson = animationJson.samplers[samplerStr];
            let animInputStr = samplerJson.input;
            var animOutputStr = samplerJson.output;
            let animInputAccessorStr = animationJson.parameters[animInputStr];
            let animOutputAccessorStr = animationJson.parameters[animOutputStr];

            var animInputArray = this._accessBinary(animInputAccessorStr, json, arrayBuffer, 1.0, gl);
            if (animOutputStr === 'translation') {
              var animOutputArray = this._accessBinary(animOutputAccessorStr, json, arrayBuffer, scale, gl);
            } else if (animOutputStr === 'rotation') {
              var animOutputArray = this._accessBinary(animOutputAccessorStr, json, arrayBuffer, 1.0, gl, true);
            } else {
              var animOutputArray = this._accessBinary(animOutputAccessorStr, json, arrayBuffer, 1.0, gl);
            }

            let animationAttributeName = '';
            if (animOutputStr === 'translation') {
              animationAttributeName = 'translate';
            } else if (animOutputStr === 'rotation') {
              animationAttributeName = 'quaternion';
            } else {
              animationAttributeName = animOutputStr;
            }
            mesh.setAnimationAtLine(0, animationAttributeName, animInputArray, animOutputArray);
          }
        }
      }
      material.setVertexN(geometry, indices.length);
      if (defaultShader) {
        material.shader = defaultShader;
      } else {
        material.shader = new PhongShader(canvas);
      }
      geometry.materials = [material];

      resolve(mesh);
    };

    oReq.send(null);
  }

  _accessBinary(accessorStr, json, arrayBuffer, scale, gl, quaternionIfVec4 = false) {
    var accessorJson = json.accessors[accessorStr];
    var bufferViewStr = accessorJson.bufferView;
    var bufferViewJson = json.bufferViews[bufferViewStr];
    var byteOffset = bufferViewJson.byteOffset + accessorJson.byteOffset;

    var componentN = 0;
    switch (accessorJson.type) {
      case 'SCALAR':
        componentN = 1;
        break;
      case 'VEC2':
        componentN = 2;
        break;
      case 'VEC3':
        componentN = 3;
        break;
      case 'VEC4':
        componentN = 4;
        break;
    }

    var bytesPerComponent = 0;
    var dataViewMethod = '';
    switch (accessorJson.componentType) {
      case gl.UNSIGNED_SHORT:
        bytesPerComponent = 2;
        dataViewMethod = 'getUint16';
        break;
      case gl.FLOAT:
        bytesPerComponent = 4;
        dataViewMethod = 'getFloat32';
        break;
    }

    var byteLength = bytesPerComponent * componentN * accessorJson.count;

    var vertexAttributeArray = [];
    let dataView = new DataView(arrayBuffer, byteOffset, byteLength);
    let byteDelta = bytesPerComponent * componentN;
    let littleEndian = true;
    for (let pos = 0; pos < byteLength; pos += byteDelta) {

      switch (accessorJson.type) {
        case 'SCALAR':
          vertexAttributeArray.push(dataView[dataViewMethod](pos, littleEndian));
          break;
        case 'VEC2':
          vertexAttributeArray.push(new Vector2(
            dataView[dataViewMethod](pos, littleEndian)*scale,
            dataView[dataViewMethod](pos+bytesPerComponent, littleEndian)*scale
          ));
          break;
        case 'VEC3':
          vertexAttributeArray.push(new Vector3(
            dataView[dataViewMethod](pos, littleEndian)*scale,
            dataView[dataViewMethod](pos+bytesPerComponent, littleEndian)*scale,
            dataView[dataViewMethod](pos+bytesPerComponent*2, littleEndian)*scale
          ));
          break;
        case 'VEC4':
          if (quaternionIfVec4) {
            vertexAttributeArray.push(Quaternion.invert(new Quaternion(
              dataView[dataViewMethod](pos, littleEndian),
              dataView[dataViewMethod](pos+bytesPerComponent, littleEndian),
              dataView[dataViewMethod](pos+bytesPerComponent*2, littleEndian),
              dataView[dataViewMethod](pos+bytesPerComponent*3, littleEndian)
            )));
          } else {
            vertexAttributeArray.push(new Vector4(
              dataView[dataViewMethod](pos, littleEndian)*scale,
              dataView[dataViewMethod](pos+bytesPerComponent, littleEndian)*scale,
              dataView[dataViewMethod](pos+bytesPerComponent*2, littleEndian)*scale,
              dataView[dataViewMethod](pos+bytesPerComponent*3, littleEndian)
            ));
          }
          break;
      }

    }

    return vertexAttributeArray;
  }

}



GLBoost["GLTFLoader"] = GLTFLoader;
