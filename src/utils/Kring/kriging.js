// Extend the Array class
Array.prototype.max = function() {
    return Math.max(...this);
};
Array.prototype.min = function() {
    return Math.min(...this);
};
Array.prototype.mean = function() {
    let sum = 0;
    for (let i = 0; i < this.length; i++) sum += this[i];
    return sum / this.length;
};
Array.prototype.pip = function(x, y) {
    let c = false;
    for (let i = 0, j = this.length - 1; i < this.length; j = i++) {
        if (((this[i][1] > y) !== (this[j][1] > y)) &&
            (x < (this[j][0] - this[i][0]) * (y - this[i][1]) / (this[j][1] - this[i][1]) + this[i][0])) {
            c = !c;
        }
    }
    return c;
};
const C=null;
const kriging = (function() {
    const kriging = {};
    
    const createArrayWithValues = (value, n) => {
        const array = [];
        for (let i = 0; i < n; i++) {
            array.push(value);
        }
        return array;
    };

    // Matrix algebra
    const kriging_matrix_diag = (c, n) => {
        const Z = createArrayWithValues(0, n * n);
        for (let i = 0; i < n; i++) Z[i * n + i] = c;
        return Z;
    };

    const kriging_matrix_transpose = (X, n, m) => {
        const Z = Array(m * n);
        for (let i = 0; i < n; i++)
            for (let j = 0; j < m; j++)
                Z[j * n + i] = X[i * m + j];
        return Z;
    };

    const kriging_matrix_scale = (X, c, n, m) => {
        for (let i = 0; i < n; i++)
            for (let j = 0; j < m; j++)
                X[i * m + j] *= c;
    };

    const kriging_matrix_add = (X, Y, n, m) => {
        const Z = Array(n * m);
        for (let i = 0; i < n; i++)
            for (let j = 0; j < m; j++)
                Z[i * m + j] = X[i * m + j] + Y[i * m + j];
        return Z;
    };

    const kriging_matrix_multiply = (X, Y, n, m, p) => {
        const Z = Array(n * p);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < p; j++) {
                Z[i * p + j] = 0;
                for (let k = 0; k < m; k++)
                    Z[i * p + j] += X[i * m + k] * Y[k * p + j];
            }
        }
        return Z;
    };

    const kriging_matrix_chol = (X, n) => {
        const p = Array(n);
        for (let i = 0; i < n; i++) p[i] = X[i * n + i];
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < i; j++)
                p[i] -= X[i * n + j] * X[i * n + j];
            if (p[i] <= 0) return false;
            p[i] = Math.sqrt(p[i]);
            for (let j = i + 1; j < n; j++) {
                for (let k = 0; k < i; k++)
                    X[j * n + i] -= X[j * n + k] * X[i * n + k];
                X[j * n + i] /= p[i];
            }
        }
        for (let i = 0; i < n; i++) X[i * n + i] = p[i];
        return true;
    };

    const kriging_matrix_chol2inv = (X, n) => {
        for (let i = 0; i < n; i++) {
            X[i * n + i] = 1 / X[i * n + i];
            for (let j = i + 1; j < n; j++) {
                let sum = 0;
                for (let k = i; k < j; k++)
                    sum -= X[j * n + k] * X[k * n + i];
                X[j * n + i] = sum / X[j * n + j];
            }
        }
        for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++)
                X[i * n + j] = 0;
        for (let i = 0; i < n; i++) {
            X[i * n + i] *= X[i * n + i];
            for (let k = i + 1; k < n; k++)
                X[i * n + i] += X[k * n + i] * X[k * n + i];
            for (let j = i + 1; j < n; j++)
                for (let k = j; k < n; k++)
                    X[i * n + j] += X[k * n + i] * X[k * n + j];
        }
        for (let i = 0; i < n; i++)
            for (let j = 0; j < i; j++)
                X[i * n + j] = X[j * n + i];
    };

    const kriging_matrix_solve = (X, n) => {
        const m = n;
        const b = Array(n * n);
        const indxc = Array(n);
        const indxr = Array(n);
        const ipiv = Array(n);
        let icol, irow;
        let big, dum, pivinv, temp;

        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++) {
                b[i * n + j] = (i === j) ? 1 : 0;
            }
        for (let j = 0; j < n; j++) ipiv[j] = 0;
        for (let i = 0; i < n; i++) {
            big = 0;
            for (let j = 0; j < n; j++) {
                if (ipiv[j] !== 1) {
                    for (let k = 0; k < n; k++) {
                        if (ipiv[k] === 0) {
                            if (Math.abs(X[j * n + k]) >= big) {
                                big = Math.abs(X[j * n + k]);
                                irow = j;
                                icol = k;
                            }
                        }
                    }
                }
            }
            ++(ipiv[icol]);

            if (irow !== icol) {
                for (let l = 0; l < n; l++) {
                    temp = X[irow * n + l];
                    X[irow * n + l] = X[icol * n + l];
                    X[icol * n + l] = temp;
                }
                for (let l = 0; l < m; l++) {
                    temp = b[irow * n + l];
                    b[irow * n + l] = b[icol * n + l];
                    b[icol * n + l] = temp;
                }
            }
            indxr[i] = irow;
            indxc[i] = icol;

            if (X[icol * n + icol] === 0) return false; // Singular

            pivinv = 1 / X[icol * n + icol];
            X[icol * n + icol] = 1;
            for (let l = 0; l < n; l++) X[icol * n + l] *= pivinv;
            for (let l = 0; l < m; l++) b[icol * n + l] *= pivinv;

            for (let ll = 0; ll < n; ll++) {
                if (ll !== icol) {
                    dum = X[ll * n + icol];
                    X[ll * n + icol] = 0;
                    for (let l = 0; l < n; l++) X[ll * n + l] -= X[icol * n + l] * dum;
                    for (let l = 0; l < m; l++) b[ll * n + l] -= b[icol * n + l] * dum;
                }
            }
        }
        for (let l = (n - 1); l >= 0; l--) {
            if (indxr[l] !== indxc[l]) {
                for (let k = 0; k < n; k++) {
                    temp = X[k * n + indxr[l]];
                    X[k * n + indxr[l]] = X[k * n + indxc[l]];
                    X[k * n + indxc[l]] = temp;
                }
            }
        }
        return true;
    };

    // Variogram models
    const kriging_variogram_gaussian = (h, nugget, range, sill, A) => {
        return nugget + ((sill - nugget) / range) *
            (1.0 - Math.exp(-(1.0 / A) * Math.pow(h / range, 2)));
    };
    const kriging_variogram_exponential = (h, nugget, range, sill, A) => {
        return nugget + ((sill - nugget) / range) *
            (1.0 - Math.exp(-(1.0 / A) * (h / range)));
    };
    const kriging_variogram_spherical = (h, nugget, range, sill, A) => {
        if (h > range) return nugget + (sill - nugget) / range;
        return nugget + ((sill - nugget) / range) *
            (1.5 * (h / range) - 0.5 * Math.pow(h / range, 3));
    };

    // Train using gaussian processes with bayesian priors
    kriging.train = function(t, x, y, model, sigma2, alpha) {
        const variogram = {
            t: t,
            x: x,
            y: y,
            nugget: 0.0,
            range: 0.0,
            sill: 0.0,
            A: 1 / 3,
            n: 0
        };
        switch (model) {
            case "gaussian":
                variogram.model = kriging_variogram_gaussian;
                break;
            case "exponential":
                variogram.model = kriging_variogram_exponential;
                break;
            case "spherical":
                variogram.model = kriging_variogram_spherical;
                break;
        }

        // Lag distance/semivariance
        let n = t.length;
        const distance = Array((n * n - n) / 2);
        for (let i = 0, k = 0; i < n; i++) {
            for (let j = 0; j < i; j++, k++) {
                distance[k] = Array(2);
                distance[k][0] = Math.pow(
                    Math.pow(x[i] - x[j], 2) +
                    Math.pow(y[i] - y[j], 2), 0.5);
                distance[k][1] = Math.abs(t[i] - t[j]);
            }
        }
        distance.sort((a, b) => a[0] - b[0]);
        variogram.range = distance[(n * n - n) / 2 - 1][0];

        // Bin lag distance
        const lagsCount = ((n * n - n) / 2) > 30 ? 30 : (n * n - n) / 2;
        const tolerance = variogram.range / lagsCount;
        const lag = createArrayWithValues(0, lagsCount);
        const semi = createArrayWithValues(0, lagsCount);
        let actualLags = 0;

        if (lagsCount < 30) {
            for (let l = 0; l < lagsCount; l++) {
                lag[l] = distance[l][0];
                semi[l] = distance[l][1];
            }
            actualLags = lagsCount;
        } else {
            for (let i = 0, j = 0; i < lagsCount && j < ((n * n - n) / 2); i++) {
                let k = 0;
                while (distance[j][0] <= ((i + 1) * tolerance)) {
                    lag[actualLags] += distance[j][0];
                    semi[actualLags] += distance[j][1];
                    j++;
                    k++;
                    if (j >= ((n * n - n) / 2)) break;
                }
                if (k > 0) {
                    lag[actualLags] /= k;
                    semi[actualLags] /= k;
                    actualLags++;
                }
            }
            if (actualLags < 2) return variogram; // Error: Not enough points
        }

        // Feature transformation
        n = actualLags;
        variogram.range = lag[n - 1] - lag[0];
        const X = createArrayWithValues(1, 2 * n);
        const Y = Array(n);
        const A_param = variogram.A;
        for (let i = 0; i < n; i++) {
            switch (model) {
                case "gaussian":
                    X[i * 2 + 1] = 1.0 - Math.exp(-(1.0 / A_param) * Math.pow(lag[i] / variogram.range, 2));
                    break;
                case "exponential":
                    X[i * 2 + 1] = 1.0 - Math.exp(-(1.0 / A_param) * lag[i] / variogram.range);
                    break;
                case "spherical":
                    X[i * 2 + 1] = 1.5 * (lag[i] / variogram.range) - 0.5 * Math.pow(lag[i] / variogram.range, 3);
                    break;
            }
            Y[i] = semi[i];
        }

        // Least squares
        const Xt = kriging_matrix_transpose(X, n, 2);
        let Z = kriging_matrix_multiply(Xt, X, 2, n, 2);
        Z = kriging_matrix_add(Z, kriging_matrix_diag(1 / alpha, 2), 2, 2);
        const cloneZ = Z.slice(0);
        if (kriging_matrix_chol(Z, 2))
            kriging_matrix_chol2inv(Z, 2);
        else {
            kriging_matrix_solve(cloneZ, 2);
            Z = cloneZ;
        }
        const W = kriging_matrix_multiply(kriging_matrix_multiply(Z, Xt, 2, 2, n), Y, 2, n, 1);

        // Variogram parameters
        variogram.nugget = W[0];
        variogram.sill = W[1] * variogram.range + variogram.nugget;
        variogram.n = x.length;

        // Gram matrix with prior
        n = x.length;
        const K = Array(n * n);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < i; j++) {
                K[i * n + j] = variogram.model(Math.pow(Math.pow(x[i] - x[j], 2) + Math.pow(y[i] - y[j], 2), 0.5),
                    variogram.nugget, variogram.range, variogram.sill, variogram.A);
                K[j * n + i] = K[i * n + j];
            }
            K[i * n + i] = variogram.model(0, variogram.nugget, variogram.range, variogram.sill, variogram.A);
        }

        // Inverse penalized Gram matrix projected to target vector
        const C = kriging_matrix_add(K, kriging_matrix_diag(sigma2, n), n, n);
        const cloneC = C.slice(0);
        if (kriging_matrix_chol(C, n))
            kriging_matrix_chol2inv(C, n);
        else {
            kriging_matrix_solve(cloneC, n);
            C = cloneC;
        }

        // Copy unprojected inverted matrix as K
        const K_inv = C.slice(0);
        const M = kriging_matrix_multiply(C, t, n, n, 1);
        variogram.K = K_inv;
        variogram.M = M;

        return variogram;
    };

    // Model prediction
    kriging.predict = function(x, y, variogram) {
        const k = Array(variogram.n);
        for (let i = 0; i < variogram.n; i++)
            k[i] = variogram.model(Math.pow(Math.pow(x - variogram.x[i], 2) + Math.pow(y - variogram.y[i], 2), 0.5),
                variogram.nugget, variogram.range, variogram.sill, variogram.A);
        return kriging_matrix_multiply(k, variogram.M, 1, variogram.n, 1)[0];
    };

    kriging.variance = function(x, y, variogram) {
        const k = Array(variogram.n);
        for (let i = 0; i < variogram.n; i++)
            k[i] = variogram.model(Math.pow(Math.pow(x - variogram.x[i], 2) + Math.pow(y - variogram.y[i], 2), 0.5),
                variogram.nugget, variogram.range, variogram.sill, variogram.A);
        return variogram.model(0, variogram.nugget, variogram.range, variogram.sill, variogram.A) +
            kriging_matrix_multiply(kriging_matrix_multiply(k, variogram.K, 1, variogram.n, variogram.n), k, 1, variogram.n, 1)[0];
    };

    // Gridded matrices or contour paths
    kriging.grid = function(polygons, variogram, width) {
        const n = polygons.length;
        if (n === 0) return;

        // Boundaries of polygons space
        const xlim = [polygons[0][0][0], polygons[0][0][0]];
        const ylim = [polygons[0][0][1], polygons[0][0][1]];
        for (let i = 0; i < n; i++)
            for (let j = 0; j < polygons[i].length; j++) {
                if (polygons[i][j][0] < xlim[0]) xlim[0] = polygons[i][j][0];
                if (polygons[i][j][0] > xlim[1]) xlim[1] = polygons[i][j][0];
                if (polygons[i][j][1] < ylim[0]) ylim[0] = polygons[i][j][1];
                if (polygons[i][j][1] > ylim[1]) ylim[1] = polygons[i][j][1];
            }

        // Alloc for O(n^2) space
        const gridXCount = Math.ceil((xlim[1] - xlim[0]) / width);
        const gridYCount = Math.ceil((ylim[1] - ylim[0]) / width);
        const A = Array(gridXCount + 1);
        for (let i = 0; i <= gridXCount; i++) A[i] = Array(gridYCount + 1);

        for (let i = 0; i < n; i++) {
            // Local range for polygons[i]
            const lxlim = [polygons[i][0][0], polygons[i][0][0]];
            const lylim = [polygons[i][0][1], polygons[i][0][1]];
            for (let j = 1; j < polygons[i].length; j++) {
                if (polygons[i][j][0] < lxlim[0]) lxlim[0] = polygons[i][j][0];
                if (polygons[i][j][0] > lxlim[1]) lxlim[1] = polygons[i][j][0];
                if (polygons[i][j][1] < lylim[0]) lylim[0] = polygons[i][j][1];
                if (polygons[i][j][1] > lylim[1]) lylim[1] = polygons[i][j][1];
            }

            // Loop through polygon subspace
            const a = [
                Math.floor(((lxlim[0] - ((lxlim[0] - xlim[0]) % width)) - xlim[0]) / width),
                Math.ceil(((lxlim[1] - ((lxlim[1] - xlim[1]) % width)) - xlim[0]) / width)
            ];
            const b = [
                Math.floor(((lylim[0] - ((lylim[0] - ylim[0]) % width)) - ylim[0]) / width),
                Math.ceil(((lylim[1] - ((lylim[1] - ylim[1]) % width)) - ylim[0]) / width)
            ];

            for (let j = a[0]; j <= a[1]; j++) {
                for (let k = b[0]; k <= b[1]; k++) {
                    const xtarget = xlim[0] + j * width;
                    const ytarget = ylim[0] + k * width;
                    if (polygons[i].pip(xtarget, ytarget))
                        A[j][k] = kriging.predict(xtarget, ytarget, variogram);
                }
            }
        }
        A.xlim = xlim;
        A.ylim = ylim;
        A.zlim = [variogram.t.min(), variogram.t.max()];
        A.width = width;
        return A;
    };

    kriging.contour = function(value, polygons, variogram) {};

    // Parse hex color to [r, g, b]
    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    // Plotting: fill canvas pixel-by-pixel to avoid gaps/overlaps (no gray/black lines)
    kriging.plot = function(canvas, grid, xlim, ylim, colors) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        const rangeX = xlim[1] - xlim[0];
        const rangeY = ylim[1] - ylim[0];
        const rangeZ = grid.zlim[1] - grid.zlim[0];
        const n = grid.length;
        const m = grid[0].length;
        const colorTable = colors.map(hexToRgb);

        const imageData = ctx.createImageData(w, h);
        const data = imageData.data;

        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const lon = xlim[0] + (px / w) * rangeX;
                const lat = ylim[1] - (py / h) * rangeY;
                const gi = (lon - grid.xlim[0]) / grid.width;
                const gj = (lat - grid.ylim[0]) / grid.width;
                const i = Math.floor(gi);
                const j = Math.floor(gj);
                const base = (py * w + px) * 4;

                if (i >= 0 && i < n && j >= 0 && j < m && grid[i][j] !== undefined) {
                    let z = (grid[i][j] - grid.zlim[0]) / rangeZ;
                    if (z < 0) z = 0;
                    if (z > 1) z = 1;
                    const ci = Math.min(Math.floor(z * (colorTable.length - 1)), colorTable.length - 1);
                    const rgb = colorTable[ci];
                    data[base] = rgb[0];
                    data[base + 1] = rgb[1];
                    data[base + 2] = rgb[2];
                    data[base + 3] = 255;
                } else {
                    const rgb = colorTable[0];
                    data[base] = rgb[0];
                    data[base + 1] = rgb[1];
                    data[base + 2] = rgb[2];
                    data[base + 3] = 255;
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
    };

    return kriging;
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = kriging;
}
export default kriging;