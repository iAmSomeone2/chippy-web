#version 300 es

layout (location=0) in vec3 position;

uniform mat4 projection;
uniform mat4 model;
uniform mat4 view;

uniform vec3 color;

out vec3 vertexColor;

void main() {
    gl_Position = projection * model * vec4(position, 1.0);
    vertexColor = color;
}