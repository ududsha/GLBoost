import Shader from './Shader'
import SimpleShader from './SimpleShader'

export class HalfLambertShaderSource {
  VSDefine_HalfLambertShaderSource(in_, out_, f, lights) {
    var shaderText = '';
    if (Shader._exist(f, GLBoost.NORMAL)) {
      shaderText += `${in_} vec3 aVertex_normal;\n`;
      shaderText += `${out_} vec3 normal;\n`;
    }
    shaderText += `${out_} vec4 position;\n`;

    return shaderText;
  }

  VSTransform_HalfLambertShaderSource(existCamera_f, f, lights) {
    var shaderText = '';

    shaderText += '  position = vec4(aVertex_position, 1.0);\n';
    shaderText += '  normal = aVertex_normal;\n';

    return shaderText;
  }

  FSDefine_HalfLambertShaderSource(in_, f, lights) {
    var shaderText = '';
    if (Shader._exist(f, GLBoost.NORMAL)) {
      shaderText += `${in_} vec3 normal;\n`;
    }
    shaderText += `${in_} vec4 position;\n`;
    shaderText += `uniform vec4 lightPosition[${lights.length}];\n`;
    shaderText += `uniform vec4 lightDiffuse[${lights.length}];\n`;

    return shaderText;
  }

  FSShade_HalfLambertShaderSource(f, gl, lights) {
    var shaderText = '';

    shaderText += '  vec4 surfaceColor = rt1;\n';
    shaderText += '  rt1 = vec4(0.0, 0.0, 0.0, 1.0);\n';

    shaderText += `  for (int i=0; i<${lights.length}; i++) {\n`;
    // if PointLight: lightPosition[i].w === 1.0      if DirectionalLight: lightPosition[i].w === 0.0
    shaderText += '    vec3 light = normalize(lightPosition[i].xyz - position.xyz * lightPosition[i].w);\n';
    shaderText += '    float halfLambert = dot(light, normal)*0.5+0.5;\n';
    shaderText += '    float diffuse = halfLambert*halfLambert;\n';
    shaderText += '    rt1.rgb += lightDiffuse[i].rgb * diffuse * surfaceColor.rgb;\n';
    shaderText += '  }\n';
    //shaderText += '  rt1.a = 1.0;\n';
    //shaderText += '  rt1 = vec4(position.xyz, 1.0);\n';


    return shaderText;
  }

  prepare_HalfLambertShaderSource(gl, shaderProgram, vertexAttribs, existCamera_f, lights) {

    var vertexAttribsAsResult = [];
    vertexAttribs.forEach((attribName)=>{
      if (attribName === GLBoost.NORMAL) {
        shaderProgram['vertexAttribute_' + attribName] = gl.getAttribLocation(shaderProgram, 'aVertex_' + attribName);
        gl.enableVertexAttribArray(shaderProgram['vertexAttribute_' + attribName]);
        vertexAttribsAsResult.push(attribName);
      }
    });
    /*
    if (existCamera_f) {
      shaderProgram.modelViewMatrix = gl.getUniformLocation(shaderProgram, 'modelViewMatrix');
      shaderProgram.invNormalMatrix = gl.getUniformLocation(shaderProgram, 'invNormalMatrix');
    }
    */

    lights = Shader.getDefaultPointLightIfNotExsist(gl, lights);

    for(let i=0; i<lights.length; i++) {
      shaderProgram['lightPosition_'+i] = gl.getUniformLocation(shaderProgram, `lightPosition[${i}]`);
      shaderProgram['lightDiffuse_'+i] = gl.getUniformLocation(shaderProgram, `lightDiffuse[${i}]`);
    }

    return vertexAttribsAsResult;
  }
}



export default class HalfLambertShader extends SimpleShader {
  constructor(canvas) {

    super(canvas);
    HalfLambertShader.mixin(HalfLambertShaderSource);
  }

}

GLBoost["HalfLambertShader"] = HalfLambertShader;
