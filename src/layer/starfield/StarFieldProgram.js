/**
 * @exports StarFieldProgram
 */
import WorldWind from 'webworldwind-esa';

const {
    ArgumentError,
    GpuProgram,
    Logger,
    Matrix,
    Color
} = WorldWind;

/**
 * Constructs a new program.
 * Initializes, compiles and links this GLSL program with the source code for its vertex and fragment shaders.
 * <p>
 * This method creates WebGL shaders for the program's shader sources and attaches them to a new GLSL program.
 * This method then compiles the shaders and then links the program if compilation is successful.
 * Use the bind method to make the program current during rendering.
 *
 * @alias StarFieldProgram
 * @constructor
 * @augments GpuProgram
 * @classdesc StarFieldProgram is a GLSL program that draws points representing stars.
 * @param {WebGLRenderingContext} gl The current WebGL context.
 * @throws {ArgumentError} If the shaders cannot be compiled, or linking of the compiled shaders into a program
 * fails.
 */
class StarFieldProgram extends GpuProgram {
    constructor(gl) {
        super(gl, 'attribute vec4 vertexPoint;\n' +

            'uniform mat4 mvpMatrix;\n' +
            //number of days (positive or negative) since Greenwich noon, Terrestrial Time,
            // on 1 January 2000 (J2000.0)
            'uniform float numDays;\n' +
            'uniform vec2 magnitudeRange;\n' +

            'varying float magnitudeWeight;\n' +

            //normalizes an angle between 0.0 and 359.0
            'float normalizeAngle(float angle) {\n' +
            '   float angleDivisions = angle / 360.0;\n' +
            '   return 360.0 * (angleDivisions - floor(angleDivisions));\n' +
            '}\n' +

            //transforms declination and right ascension in cartesian coordinates
            'vec3 computePosition(float dec, float ra) {\n' +
            '   float GMST = normalizeAngle(280.46061837 + 360.98564736629 * numDays);\n' +
            '   float GHA = normalizeAngle(GMST - ra);\n' +
            '   float lon = -GHA + 360.0 * step(180.0, GHA);\n' +
            '   float latRad = radians(dec);\n' +
            '   float lonRad = radians(lon);\n' +
            '   float radCosLat = cos(latRad);\n' +
            '   return vec3(radCosLat * sin(lonRad), sin(latRad), radCosLat * cos(lonRad));\n' +
            '}\n' +

            //normalizes a value between 0.0 and 1.0
            'float normalizeScalar(float value, float minValue, float maxValue){\n' +
            '   return (value - minValue) / (maxValue - minValue);\n' +
            '}\n' +

            'void main() {\n' +
            '   vec3 vertexPosition = computePosition(vertexPoint.x, vertexPoint.y);\n' +
            '   gl_Position = mvpMatrix * vec4(vertexPosition.xyz, 1.0);\n' +
            '   gl_Position.z = gl_Position.w - 0.00001;\n' +
            '   gl_PointSize = vertexPoint.z;\n' +
            '   magnitudeWeight = normalizeScalar(vertexPoint.w, magnitudeRange.x, magnitudeRange.y);\n' +
            '}', 'precision mediump float;\n' +

            'uniform sampler2D textureSampler;\n' +
            'uniform int fragMode;\n' +
            'uniform vec4 color;\n' +

            'varying float magnitudeWeight;\n' +

            'const vec4 white = vec4(1.0, 1.0, 1.0, 1.0);\n' +
            'const vec4 grey = vec4(0.5, 0.5, 0.5, 1.0);\n' +

            'void main() {\n' +
            '   if (fragMode == 1) {\n' +
            '       gl_FragColor = texture2D(textureSampler, gl_PointCoord);\n' +
            '   }\n' +
            '   else if (fragMode == 0) {\n' +
            //paint the starts in shades of grey, where the brightest star is white and the dimmest star is grey
            '       gl_FragColor = mix(white, grey, magnitudeWeight);\n' +
            '   }\n' +
            '   else if (fragMode == 2) {\n' +
            '       gl_FragColor = color;\n' +
            '   }\n' +
            '}', ["vertexPoint"]);

        this.FRAG_MODE_MIX_COLOR = 0;
        this.FRAG_MODE_TEXTURE = 1;
        this.FRAG_MODE_COLOR = 2;

        /**
         * The WebGL location for this program's 'vertexPoint' attribute.
         * @type {Number}
         * @readonly
         */
        this.vertexPointLocation = this.attributeLocation(gl, "vertexPoint");

        /**
         * The WebGL location for this program's 'mvpMatrix' uniform.
         * @type {WebGLUniformLocation}
         * @readonly
         */
        this.mvpMatrixLocation = this.uniformLocation(gl, "mvpMatrix");

        /**
         * The WebGL location for this program's 'numDays' uniform.
         * @type {WebGLUniformLocation}
         * @readonly
         */
        this.numDaysLocation = this.uniformLocation(gl, "numDays");

        /**
         * The WebGL location for this program's 'magnitudeRangeLocation' uniform.
         * @type {WebGLUniformLocation}
         * @readonly
         */
        this.magnitudeRangeLocation = this.uniformLocation(gl, "magnitudeRange");

        /**
         * The WebGL location for this program's 'textureSampler' uniform.
         * @type {WebGLUniformLocation}
         * @readonly
         */
        this.textureUnitLocation = this.uniformLocation(gl, "textureSampler");

        /**
         * The WebGL location for this program's 'textureEnabled' uniform.
         * @type {WebGLUniformLocation}
         * @readonly
         */
        this.fragModeLocation = this.uniformLocation(gl, "fragMode");

        this.colorLocation = this.uniformLocation(gl, "color");

        this.localState = {
            mvpMatrix: null,
            numDays: null,
            magnitudeRange: null,
            textureUnit: null,
            fragMode: null,
            color: null,
        };
    }

    /**
     * Loads the specified matrix as the value of this program's 'mvpMatrix' uniform variable.
     *
     * @param {WebGLRenderingContext} gl The current WebGL context.
     * @param {Matrix} matrix The matrix to load.
     * @throws {ArgumentError} If the specified matrix is null or undefined.
     */
    loadModelviewProjection(gl, matrix) {
        if (!matrix) {
            throw new ArgumentError(
                Logger.logMessage(Logger.LEVEL_SEVERE, "StarFieldProgram", "loadModelviewProjection", "missingMatrix"));
        }

        let forceLoad = false;
        if (this.localState.mvpMatrix === null) {
            forceLoad = true;
            this.localState.mvpMatrix = Matrix.fromIdentity();
        }

        if (forceLoad || !this.localState.mvpMatrix.equals(matrix)) {
            this.loadUniformMatrix(gl, matrix, this.mvpMatrixLocation);
            this.localState.mvpMatrix.copy(matrix);
        }
    }

    /**
     * Loads the specified number as the value of this program's 'numDays' uniform variable.
     *
     * @param {WebGLRenderingContext} gl The current WebGL context.
     * @param {Number} numDays The number of days (positive or negative) since Greenwich noon, Terrestrial Time,
     * on 1 January 2000 (J2000.0)
     * @throws {ArgumentError} If the specified number is null or undefined.
     */
    loadNumDays(gl, numDays) {
        if (numDays == null) {
            throw new ArgumentError(
                Logger.logMessage(Logger.LEVEL_SEVERE, "StarFieldProgram", "loadNumDays", "missingNumDays"));
        }
        if (this.localState.numDays !== numDays) {
            gl.uniform1f(this.numDaysLocation, numDays);
            this.localState.numDays = numDays;
        }
    }

    /**
     * Loads the specified numbers as the value of this program's 'magnitudeRange' uniform variable.
     *
     * @param {WebGLRenderingContext} gl The current WebGL context.
     * @param {Number} minMag
     * @param {Number} maxMag
     * @throws {ArgumentError} If the specified numbers are null or undefined.
     */
    loadMagnitudeRange(gl, minMag, maxMag) {
        if (minMag == null) {
            throw new ArgumentError(
                Logger.logMessage(Logger.LEVEL_SEVERE, "StarFieldProgram", "loadMagRange", "missingMinMag"));
        }
        if (maxMag == null) {
            throw new ArgumentError(
                Logger.logMessage(Logger.LEVEL_SEVERE, "StarFieldProgram", "loadMagRange", "missingMaxMag"));
        }
        let forceLoad = false;
        if (this.localState.magnitudeRange === null) {
            forceLoad = true;
            this.localState.magnitudeRange = [minMag, maxMag];
        }

        if (forceLoad || this.localState.magnitudeRange[0] !== minMag || this.localState.magnitudeRange[1] !== maxMag) {
            gl.uniform2f(this.magnitudeRangeLocation, minMag, maxMag);
            this.localState.magnitudeRange[0] = minMag;
            this.localState.magnitudeRange[1] = maxMag;
        }
    }

    /**
     * Loads the specified number as the value of this program's 'textureSampler' uniform variable.
     * @param {WebGLRenderingContext} gl The current WebGL context.
     * @param {Number} unit The texture unit.
     */
    loadTextureUnit(gl, unit) {
        if (this.localState.textureUnit !== unit) {
            gl.uniform1i(this.textureUnitLocation, unit - gl.TEXTURE0);
            this.localState.textureUnit = unit;
        }
    }

    loadFragMode(gl, mode) {
        if (this.localState.fragMode !== mode) {
            gl.uniform1i(this.fragModeLocation, mode);
            this.localState.fragMode = mode;
        }
    }

    loadColor(gl, color) {
        let forceLoad = false;
        if (this.localState.color === null) {
            forceLoad = true;
            this.localState.color = new Color(0, 0, 0, 0);
        }

        if (forceLoad || !this.localState.color.equals(color)) {
            this.loadUniformColor(gl, color, this.colorLocation);
            this.localState.color.copy(color);
        }
    }
}

/**
 * A string that uniquely identifies this program.
 * @type {string}
 * @readonly
 */
StarFieldProgram.key = "WorldWindGpuStarFieldFullProgram";

export default StarFieldProgram;