// kmeans.ts

export interface KMeansResult {
    clusters: number[];
    centroids: number[][];
}

export function kmeans(
    data: number[][],
    k: number,
    maxIterations = 100,
): KMeansResult {
    const n = data.length;
    const dim = data[0].length;

    // Initialize centroids by selecting k random points from the data
    let centroids = data.slice(0, k).map((point) => [...point]);

    let clusters = new Array(n).fill(0);
    let prevClusters = new Array(n).fill(-1);
    let iterations = 0;

    while (!arraysEqual(clusters, prevClusters) && iterations < maxIterations) {
        prevClusters = [...clusters];

        // Assign points to the nearest centroid
        for (let i = 0; i < n; i++) {
            let minDist = Infinity;
            let clusterIndex = 0;
            for (let j = 0; j < k; j++) {
                const dist = euclideanDistance(data[i], centroids[j]);
                if (dist < minDist) {
                    minDist = dist;
                    clusterIndex = j;
                }
            }
            clusters[i] = clusterIndex;
        }

        // Update centroids
        const newCentroids = Array.from(
            { length: k },
            () => Array(dim).fill(0),
        );
        const counts = new Array(k).fill(0);

        for (let i = 0; i < n; i++) {
            const cluster = clusters[i];
            counts[cluster]++;
            for (let d = 0; d < dim; d++) {
                newCentroids[cluster][d] += data[i][d];
            }
        }

        for (let j = 0; j < k; j++) {
            if (counts[j] === 0) continue; // Avoid division by zero
            for (let d = 0; d < dim; d++) {
                newCentroids[j][d] /= counts[j];
            }
        }

        centroids = newCentroids;
        iterations++;
    }

    return { clusters, centroids };
}

function euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

function arraysEqual(a: number[], b: number[]): boolean {
    return a.every((val, index) => val === b[index]);
}
