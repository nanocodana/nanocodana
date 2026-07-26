// `ink` imports react-devtools-core unconditionally, but only calls it when
// DEV=true. It's an optional dependency and normally isn't installed, so
// bundling would either fail to resolve it or emit an import that throws at
// startup. Aliased to this no-op instead.
export default { connectToDevTools() {} }
