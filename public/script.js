// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
    // Handle input scrolling and prevent line breaks
    const journalInput = document.getElementById("journalInput");
    journalInput.addEventListener("input", () => {
        journalInput.scrollLeft = journalInput.scrollWidth;
        // Remove any line breaks from the input
        journalInput.value = journalInput.value.replace(/[\r\n]+/g, "");
    });

    // Handle Enter key
    journalInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault(); // Prevent the default behavior (new line)
            // Find and click the submit button
            const submitButton = document.querySelector(
                '#journalForm button[type="submit"]',
            );
            submitButton.click();
        }
    });

    // Keep input focused
    journalInput.focus();
    document.addEventListener("click", () => {
        journalInput.focus();
    });

    // Initialize visualization
    fetch("/clusters")
        .then((response) => response.json())
        .then((data) => {
            if (data.clusters && data.clusters.length > 0) {
                createVisualization(data.clusters, []);
            } else {
                createVisualization();
            }
        })
        .catch((error) => {
            console.error("Error fetching clusters:", error);
            createVisualization();
        });
});

// Create visualization
function createVisualization(clusters = [], previousNodes = []) {
    // Clear previous visualization
    d3.select("#visualization").selectAll("*").remove();

    // Get container dimensions
    const container = document.getElementById("visualization");
    const width = container.offsetWidth;
    const height = window.innerHeight - 180;

    // Create SVG
    const svg = d3.select("#visualization")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Define gradient and filters
    const defs = svg.append("defs");

    // Add blur filter
    const filter = defs.append("filter")
        .attr("id", "blur")
        .attr("x", "-100%")
        .attr("y", "-100%")
        .attr("width", "300%")
        .attr("height", "300%");

    // Create a morphology filter to control the blur spread
    filter.append("feMorphology")
        .attr("operator", "dilate")
        .attr("radius", "0")
        .attr("in", "SourceGraphic")
        .attr("result", "morph");

    // Add blur effect
    filter.append("feGaussianBlur")
        .attr("in", "morph")
        .attr("stdDeviation", "0")
        .attr("result", "blur");

    // Composite with original
    filter.append("feComposite")
        .attr("in", "blur")
        .attr("in2", "SourceGraphic")
        .attr("operator", "over");

    const gradient = defs.append("radialGradient")
        .attr("id", "circleGradient")
        .attr("gradientUnits", "objectBoundingBox")
        .attr("cx", "0.5")
        .attr("cy", "0.5")
        .attr("r", "0.5")
        .attr("fx", "0.25")
        .attr("fy", "0.25");

    // Add color stops for smooth transitions
    gradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "#E4830E");

    gradient.append("stop")
        .attr("offset", "40%")
        .attr("stop-color", "#E86948");

    gradient.append("stop")
        .attr("offset", "70%")
        .attr("stop-color", "#B65A78");

    gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#6D4AAE");

    // Empty state
    if (!clusters || clusters.length === 0) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "rgba(255, 255, 255, 0.4)")
            .attr("font-size", "12px")
            .attr("font-family", "GT Flexa Mono Trial VF, monospace")
            .attr("letter-spacing", "0.1em")
            .text("Add your first idea...");
        return;
    }

    // Create nodes with preserved positions
    const nodes = clusters.map((cluster) => {
        const previousNode = previousNodes.find((p) => p.id === cluster.id);
        const totalCharacters = cluster.ideas.reduce(
            (sum, idea) => sum + idea.length,
            0,
        );
        return {
            id: cluster.id,
            title: cluster.title,
            ideas: cluster.ideas,
            // More accurate size calculation based on content
            radius: Math.max(30, Math.sqrt(totalCharacters * 10)),
            x: previousNode?.x ?? width / 2,
            y: previousNode?.y ?? height / 2,
            fx: previousNode?.x ?? width / 2,
            fy: previousNode?.y ?? height / 2,
            isUpdated: previousNode &&
                cluster.ideas.length > previousNode.ideas.length,
        };
    });

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
        .force("charge", d3.forceManyBody().strength((d) => -d.radius * 8))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius((d) => d.radius + 20))
        .force("x", d3.forceX(width / 2).strength(0.03))
        .force("y", d3.forceY(height / 2).strength(0.03));

    // Add boundary forces
    const boundaryForce = () => {
        nodes.forEach((node) => {
            // Calculate boundaries considering radius
            const minX = node.radius;
            const maxX = width - node.radius;
            const minY = node.radius;
            const maxY = height - node.radius;

            // Bounce off boundaries with dampening
            if (node.x < minX) {
                node.x = minX;
                node.vx = Math.abs(node.vx) * 0.5; // Reverse and dampen velocity
            }
            if (node.x > maxX) {
                node.x = maxX;
                node.vx = -Math.abs(node.vx) * 0.5;
            }
            if (node.y < minY) {
                node.y = minY;
                node.vy = Math.abs(node.vy) * 0.5;
            }
            if (node.y > maxY) {
                node.y = maxY;
                node.vy = -Math.abs(node.vy) * 0.5;
            }
        });
    };

    // Add boundary force to simulation tick
    simulation.on("tick", () => {
        boundaryForce();
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Release fixed positions after a short delay
    setTimeout(() => {
        nodes.forEach((node) => {
            node.fx = null;
            node.fy = null;
        });
    }, 10);

    // Add floating motion
    let time = 0;
    const floatingMotion = () => {
        time += 0.007;
        nodes.forEach((node, i) => {
            if (!node.fx && !node.fy) { // Only apply floating to unfixed nodes
                // Create unique but stable oscillation for each node
                const offset = i * (Math.PI * 2) / nodes.length;
                const xForce = Math.sin(time + offset) * 0.3;
                const yForce = Math.cos(time + offset * 0.5) * 0.3;

                node.vx = (node.vx || 0) + xForce;
                node.vy = (node.vy || 0) + yForce;

                // Apply boundary constraints after floating motion
                boundaryForce();
            }
        });
        simulation.alpha(0.1).restart();
        requestAnimationFrame(floatingMotion);
    };

    // Start floating motion
    floatingMotion();

    // Create nodes
    const node = svg.append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("class", "node")
        .attr("transform", (d) => `translate(${d.x},${d.y})`) // Set initial positions
        .call(
            d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended),
        );

    // Add circles with gradient fill
    const circles = node.append("circle")
        .attr("r", (d) => d.radius)
        .attr("fill", "url(#circleGradient)");

    // Highlight updated clusters using the same animation as hover
    circles.filter((d) => d.isUpdated)
        .attr("filter", "url(#blur)")
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("r", (d) => d.radius * 1.4)
        .style("opacity", 0.8);

    // Animate the blur effect for updated clusters
    filter.select("feMorphology")
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("radius", "10");

    filter.select("feGaussianBlur")
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("stdDeviation", "15")
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("stdDeviation", "0");

    filter.select("feMorphology")
        .transition()
        .delay(800)
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("radius", "0");

    circles.filter((d) => d.isUpdated)
        .transition()
        .delay(800)
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr("r", (d) => d.radius)
        .style("opacity", 1)
        .on("end", function () {
            d3.select(this).attr("filter", null);
        });

    // Add titles
    node.append("text")
        .attr("dy", ".35em")
        .attr("text-anchor", "middle")
        .text((d) => d.title)
        .attr("fill", "rgba(255, 255, 255, 1)")
        .attr("font-size", "13px")
        .attr("font-family", "GT Flexa Mono Trial VF, monospace")
        .style("text-shadow", "0 1px 3px rgba(0, 0, 0, 0.3)");

    // Tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    // Hover effects
    node.on("mouseover", function (event, d) {
        const circle = d3.select(this).select("circle");
        const currentRadius = d.radius;

        // Apply filter immediately
        circle.attr("filter", "url(#blur)");

        // Animate the circle size and blur
        circle.transition()
            .duration(800)
            .ease(d3.easeCubicOut)
            .attr("r", currentRadius * 1.4)
            .style("opacity", 0.8);

        // Animate the blur effect
        filter.select("feMorphology")
            .transition()
            .duration(800)
            .ease(d3.easeCubicOut)
            .attr("radius", "10");

        filter.select("feGaussianBlur")
            .transition()
            .duration(800)
            .ease(d3.easeCubicOut)
            .attr("stdDeviation", "15");

        tooltip.transition()
            .duration(200)
            .style("opacity", 0.9);
        tooltip.html(d.ideas.join("<br>"))
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
    })
        .on("mouseout", function (event, d) {
            const circle = d3.select(this).select("circle");
            const currentRadius = d.radius;

            // Animate the circle size and opacity back
            circle.transition()
                .duration(800)
                .ease(d3.easeCubicOut)
                .attr("r", currentRadius)
                .style("opacity", 1)
                .on("end", function () {
                    // Remove filter after animation
                    d3.select(this).attr("filter", null);
                });

            // Reset the blur effect
            filter.select("feMorphology")
                .transition()
                .duration(800)
                .ease(d3.easeCubicOut)
                .attr("radius", "0");

            filter.select("feGaussianBlur")
                .transition()
                .duration(800)
                .ease(d3.easeCubicOut)
                .attr("stdDeviation", "0");

            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    // Drag functions
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }
}

// Handle form submission
let currentNodes = [];
document.getElementById("journalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("journalInput");
    const journal = input.value.trim();

    if (journal) {
        try {
            const response = await fetch("/submit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ journal }),
            });

            if (response.ok) {
                const data = await response.json();
                // Store current node positions before updating
                const nodes = d3.selectAll(".node").data();
                createVisualization(data.clusters, nodes);
                input.value = "";
            }
        } catch (error) {
            console.error("Error submitting idea:", error);
        }
    }
});

// Handle clear history
document.getElementById("clearHistory").addEventListener("click", async () => {
    try {
        const response = await fetch("/clear", { method: "POST" });
        if (response.ok) {
            createVisualization();
        }
    } catch (error) {
        console.error("Error clearing history:", error);
    }
});

const dropZone = document.getElementById("fileDropZone");

// Highlight on hover
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("hover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("hover");
});

// Handle drop
dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("hover");

    const files = [...e.dataTransfer.files];

    for (const file of files) {
        const text = await extractTextFromFile(file);
        if (text.length > 20) {
            try {
                const response = await fetch("/embed-cluster", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ text }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const nodes = d3.selectAll(".node").data();
                    createVisualization(data.clusters, nodes);
                }
            } catch (error) {
                console.error("Error uploading file:", error);
            }
        }
    }
});

async function extractTextFromFile(file) {
    return new Promise((resolve) => {
        if (file.type === "text/plain") {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsText(file);
        } else if (file.type === "application/pdf") {
            const reader = new FileReader();
            reader.onload = async () => {
                const typedarray = new Uint8Array(reader.result);

                // Import PDF.js dynamically and process the file
                const pdfjsLib = await import(
                    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.269/build/pdf.min.mjs"
                );
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.269/build/pdf.worker.min.mjs";

                const pdf = await pdfjsLib.getDocument({ data: typedarray })
                    .promise;
                let text = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map((item) => item.str).join(" ") +
                        "\n";
                }
                resolve(text);
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert("Unsupported file type: " + file.name);
            resolve("");
        }
    });
}
