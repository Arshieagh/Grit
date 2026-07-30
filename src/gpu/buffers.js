export function createBuffer(device, { data, usage, label }) {
  const buffer = device.createBuffer({
    label: label,
    size: data.byteLength,
    usage: usage,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}