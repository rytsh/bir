<script lang="ts">
  interface MetadataEntry {
    tag: string;
    value: string;
    category: string;
  }

  interface GPSData {
    latitude: number | null;
    latitudeRef: string | null;
    longitude: number | null;
    longitudeRef: string | null;
  }

  let imageFile = $state<File | null>(null);
  let imageUrl = $state<string | null>(null);
  let metadata = $state<MetadataEntry[]>([]);
  let gpsData = $state<GPSData>({ latitude: null, latitudeRef: null, longitude: null, longitudeRef: null });
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let dragOver = $state(false);
  let copied = $state(false);

  // EXIF tag names mapping
  const exifTags: Record<number, { name: string; category: string }> = {
    // Image IFD
    0x010e: { name: "ImageDescription", category: "Image" },
    0x010f: { name: "Make", category: "Camera" },
    0x0110: { name: "Model", category: "Camera" },
    0x0112: { name: "Orientation", category: "Image" },
    0x011a: { name: "XResolution", category: "Image" },
    0x011b: { name: "YResolution", category: "Image" },
    0x0128: { name: "ResolutionUnit", category: "Image" },
    0x0131: { name: "Software", category: "Image" },
    0x0132: { name: "DateTime", category: "Date/Time" },
    0x013b: { name: "Artist", category: "Author" },
    0x8298: { name: "Copyright", category: "Author" },
    // EXIF IFD
    0x829a: { name: "ExposureTime", category: "Camera" },
    0x829d: { name: "FNumber", category: "Camera" },
    0x8822: { name: "ExposureProgram", category: "Camera" },
    0x8827: { name: "ISOSpeedRatings", category: "Camera" },
    0x9000: { name: "ExifVersion", category: "EXIF" },
    0x9003: { name: "DateTimeOriginal", category: "Date/Time" },
    0x9004: { name: "DateTimeDigitized", category: "Date/Time" },
    0x9201: { name: "ShutterSpeedValue", category: "Camera" },
    0x9202: { name: "ApertureValue", category: "Camera" },
    0x9203: { name: "BrightnessValue", category: "Camera" },
    0x9204: { name: "ExposureBiasValue", category: "Camera" },
    0x9205: { name: "MaxApertureValue", category: "Camera" },
    0x9207: { name: "MeteringMode", category: "Camera" },
    0x9208: { name: "LightSource", category: "Camera" },
    0x9209: { name: "Flash", category: "Camera" },
    0x920a: { name: "FocalLength", category: "Camera" },
    0x927c: { name: "MakerNote", category: "Camera" },
    0x9286: { name: "UserComment", category: "Author" },
    0xa000: { name: "FlashpixVersion", category: "EXIF" },
    0xa001: { name: "ColorSpace", category: "Image" },
    0xa002: { name: "PixelXDimension", category: "Image" },
    0xa003: { name: "PixelYDimension", category: "Image" },
    0xa20e: { name: "FocalPlaneXResolution", category: "Camera" },
    0xa20f: { name: "FocalPlaneYResolution", category: "Camera" },
    0xa210: { name: "FocalPlaneResolutionUnit", category: "Camera" },
    0xa401: { name: "CustomRendered", category: "Camera" },
    0xa402: { name: "ExposureMode", category: "Camera" },
    0xa403: { name: "WhiteBalance", category: "Camera" },
    0xa404: { name: "DigitalZoomRatio", category: "Camera" },
    0xa405: { name: "FocalLengthIn35mmFilm", category: "Camera" },
    0xa406: { name: "SceneCaptureType", category: "Camera" },
    0xa408: { name: "Contrast", category: "Camera" },
    0xa409: { name: "Saturation", category: "Camera" },
    0xa40a: { name: "Sharpness", category: "Camera" },
    // GPS IFD
    0x0000: { name: "GPSVersionID", category: "GPS" },
    0x0001: { name: "GPSLatitudeRef", category: "GPS" },
    0x0002: { name: "GPSLatitude", category: "GPS" },
    0x0003: { name: "GPSLongitudeRef", category: "GPS" },
    0x0004: { name: "GPSLongitude", category: "GPS" },
    0x0005: { name: "GPSAltitudeRef", category: "GPS" },
    0x0006: { name: "GPSAltitude", category: "GPS" },
    0x0007: { name: "GPSTimeStamp", category: "GPS" },
    0x001d: { name: "GPSDateStamp", category: "GPS" },
  };

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith("image/")) {
      loadImage(file);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      loadImage(file);
    }
  }

  async function loadImage(file: File) {
    imageFile = file;
    error = null;
    metadata = [];
    gpsData = { latitude: null, latitudeRef: null, longitude: null, longitudeRef: null };
    isLoading = true;

    // Create preview URL
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    imageUrl = URL.createObjectURL(file);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const dataView = new DataView(arrayBuffer);
      
      // Check file format and extract metadata
      if (dataView.getUint16(0) === 0xffd8) {
        // JPEG
        extractJpegMetadata(dataView);
      } else if (isPng(dataView)) {
        // PNG
        extractPngMetadata(dataView);
      } else if (isWebP(dataView)) {
        // WebP
        extractWebPMetadata(dataView);
      } else if (isGif(dataView)) {
        // GIF
        extractGifMetadata(dataView);
      } else {
        // Add basic file info even if we can't read specific metadata
        metadata = [
          { tag: "FileName", value: file.name, category: "File" },
          { tag: "FileSize", value: formatFileSize(file.size), category: "File" },
          { tag: "FileType", value: file.type || "Unknown", category: "File" },
          { tag: "LastModified", value: new Date(file.lastModified).toLocaleString(), category: "File" },
        ];
      }

      // Add file info to metadata
      const fileInfo: MetadataEntry[] = [
        { tag: "FileName", value: file.name, category: "File" },
        { tag: "FileSize", value: formatFileSize(file.size), category: "File" },
        { tag: "FileType", value: file.type || "Unknown", category: "File" },
        { tag: "LastModified", value: new Date(file.lastModified).toLocaleString(), category: "File" },
      ];
      
      metadata = [...fileInfo, ...metadata];
    } catch (e) {
      error = "Failed to read image metadata";
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  function isPng(dataView: DataView): boolean {
    return dataView.getUint32(0) === 0x89504e47 && dataView.getUint32(4) === 0x0d0a1a0a;
  }

  function isWebP(dataView: DataView): boolean {
    // WebP signature: "RIFF" at offset 0, "WEBP" at offset 8
    if (dataView.byteLength < 12) return false;
    const riff = dataView.getUint32(0, false);
    const webp = dataView.getUint32(8, false);
    return riff === 0x52494646 && webp === 0x57454250; // "RIFF" and "WEBP"
  }

  function isGif(dataView: DataView): boolean {
    // GIF signature: "GIF87a" or "GIF89a"
    if (dataView.byteLength < 6) return false;
    const gif = String.fromCharCode(
      dataView.getUint8(0),
      dataView.getUint8(1),
      dataView.getUint8(2)
    );
    return gif === "GIF";
  }

  function extractPngMetadata(dataView: DataView) {
    const entries: MetadataEntry[] = [];
    let offset = 8; // Skip PNG signature

    while (offset < dataView.byteLength - 12) {
      const length = dataView.getUint32(offset);
      const type = String.fromCharCode(
        dataView.getUint8(offset + 4),
        dataView.getUint8(offset + 5),
        dataView.getUint8(offset + 6),
        dataView.getUint8(offset + 7)
      );

      if (type === "IHDR" && length >= 8) {
        const width = dataView.getUint32(offset + 8);
        const height = dataView.getUint32(offset + 12);
        const bitDepth = dataView.getUint8(offset + 16);
        const colorType = dataView.getUint8(offset + 17);
        entries.push({ tag: "ImageWidth", value: width.toString(), category: "Image" });
        entries.push({ tag: "ImageHeight", value: height.toString(), category: "Image" });
        entries.push({ tag: "BitDepth", value: bitDepth.toString(), category: "Image" });
        entries.push({ tag: "ColorType", value: getPngColorType(colorType), category: "Image" });
      } else if (type === "tEXt" || type === "iTXt") {
        try {
          const textData = new Uint8Array(dataView.buffer, offset + 8, length);
          const nullIndex = textData.indexOf(0);
          if (nullIndex > 0) {
            const keyword = new TextDecoder().decode(textData.slice(0, nullIndex));
            const value = new TextDecoder().decode(textData.slice(nullIndex + 1));
            entries.push({ tag: keyword, value: value.substring(0, 500), category: "Text" });
          }
        } catch (e) {
          // Skip malformed text chunks
        }
      } else if (type === "IEND") {
        break;
      }

      offset += 12 + length; // 4 (length) + 4 (type) + length + 4 (CRC)
    }

    metadata = entries;
  }

  function getPngColorType(type: number): string {
    const types: Record<number, string> = {
      0: "Grayscale",
      2: "RGB",
      3: "Indexed",
      4: "Grayscale with Alpha",
      6: "RGBA",
    };
    return types[type] || `Unknown (${type})`;
  }

  function extractWebPMetadata(dataView: DataView) {
    const entries: MetadataEntry[] = [];
    
    try {
      // Skip RIFF header (4 bytes) + file size (4 bytes) + WEBP signature (4 bytes)
      let offset = 12;
      
      while (offset < dataView.byteLength - 8) {
        // Read chunk FourCC
        const chunkType = String.fromCharCode(
          dataView.getUint8(offset),
          dataView.getUint8(offset + 1),
          dataView.getUint8(offset + 2),
          dataView.getUint8(offset + 3)
        );
        
        // Chunk size is little-endian
        const chunkSize = dataView.getUint32(offset + 4, true);
        const dataOffset = offset + 8;
        
        if (chunkType === "VP8 ") {
          // Lossy WebP
          entries.push({ tag: "Format", value: "WebP (Lossy)", category: "Image" });
          // VP8 bitstream: skip 3 bytes (frame tag), then read dimensions
          if (chunkSize >= 10) {
            const width = (dataView.getUint16(dataOffset + 6, true) & 0x3fff);
            const height = (dataView.getUint16(dataOffset + 8, true) & 0x3fff);
            entries.push({ tag: "ImageWidth", value: width.toString(), category: "Image" });
            entries.push({ tag: "ImageHeight", value: height.toString(), category: "Image" });
          }
        } else if (chunkType === "VP8L") {
          // Lossless WebP
          entries.push({ tag: "Format", value: "WebP (Lossless)", category: "Image" });
          // VP8L header: 1 byte signature, then packed width/height
          if (chunkSize >= 5) {
            const bits = dataView.getUint32(dataOffset + 1, true);
            const width = (bits & 0x3fff) + 1;
            const height = ((bits >> 14) & 0x3fff) + 1;
            entries.push({ tag: "ImageWidth", value: width.toString(), category: "Image" });
            entries.push({ tag: "ImageHeight", value: height.toString(), category: "Image" });
          }
        } else if (chunkType === "VP8X") {
          // Extended WebP
          entries.push({ tag: "Format", value: "WebP (Extended)", category: "Image" });
          if (chunkSize >= 10) {
            const flags = dataView.getUint8(dataOffset);
            const hasICC = (flags & 0x20) !== 0;
            const hasAlpha = (flags & 0x10) !== 0;
            const hasEXIF = (flags & 0x08) !== 0;
            const hasXMP = (flags & 0x04) !== 0;
            const hasAnimation = (flags & 0x02) !== 0;
            
            // Width and height are 24-bit values (little-endian)
            const width = (dataView.getUint8(dataOffset + 4) | 
                          (dataView.getUint8(dataOffset + 5) << 8) | 
                          (dataView.getUint8(dataOffset + 6) << 16)) + 1;
            const height = (dataView.getUint8(dataOffset + 7) | 
                           (dataView.getUint8(dataOffset + 8) << 8) | 
                           (dataView.getUint8(dataOffset + 9) << 16)) + 1;
            
            entries.push({ tag: "ImageWidth", value: width.toString(), category: "Image" });
            entries.push({ tag: "ImageHeight", value: height.toString(), category: "Image" });
            entries.push({ tag: "HasAlpha", value: hasAlpha ? "Yes" : "No", category: "Image" });
            entries.push({ tag: "HasAnimation", value: hasAnimation ? "Yes" : "No", category: "Image" });
            if (hasICC) entries.push({ tag: "HasICCProfile", value: "Yes", category: "Image" });
            if (hasEXIF) entries.push({ tag: "HasEXIF", value: "Yes", category: "Image" });
            if (hasXMP) entries.push({ tag: "HasXMP", value: "Yes", category: "Image" });
          }
        } else if (chunkType === "EXIF") {
          // EXIF data chunk - parse as TIFF
          if (chunkSize > 8) {
            // EXIF chunk contains TIFF data
            parseExifFromOffset(dataView, dataOffset, chunkSize, entries);
          }
        } else if (chunkType === "ICCP") {
          entries.push({ tag: "ICCProfile", value: `Present (${chunkSize} bytes)`, category: "Image" });
        } else if (chunkType === "XMP ") {
          // XMP metadata
          try {
            const xmpData = new Uint8Array(dataView.buffer, dataOffset, Math.min(chunkSize, 2000));
            const xmpText = new TextDecoder().decode(xmpData);
            entries.push({ tag: "XMPData", value: xmpText.substring(0, 500), category: "XMP" });
          } catch (e) {
            // Skip malformed XMP
          }
        } else if (chunkType === "ANIM") {
          // Animation parameters
          if (chunkSize >= 6) {
            const bgColor = dataView.getUint32(dataOffset, true);
            const loopCount = dataView.getUint16(dataOffset + 4, true);
            entries.push({ tag: "BackgroundColor", value: `#${bgColor.toString(16).padStart(8, "0")}`, category: "Animation" });
            entries.push({ tag: "LoopCount", value: loopCount === 0 ? "Infinite" : loopCount.toString(), category: "Animation" });
          }
        } else if (chunkType === "ANMF") {
          // Animation frame (just count them)
          const frameCount = entries.find(e => e.tag === "FrameCount");
          if (frameCount) {
            frameCount.value = (parseInt(frameCount.value) + 1).toString();
          } else {
            entries.push({ tag: "FrameCount", value: "1", category: "Animation" });
          }
        }
        
        // Move to next chunk (chunks are padded to even bytes)
        offset += 8 + chunkSize + (chunkSize % 2);
      }
    } catch (e) {
      console.error("Error parsing WebP:", e);
    }
    
    metadata = entries;
  }

  function parseExifFromOffset(dataView: DataView, offset: number, size: number, entries: MetadataEntry[]) {
    try {
      // Check for TIFF header
      const byteOrder = dataView.getUint16(offset);
      const littleEndian = byteOrder === 0x4949; // "II"
      
      if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return; // Invalid byte order
      
      const magic = dataView.getUint16(offset + 2, littleEndian);
      if (magic !== 42) return; // Not a valid TIFF header
      
      const ifdOffset = dataView.getUint32(offset + 4, littleEndian);
      parseIFD(dataView, offset, offset + ifdOffset, littleEndian, entries, "EXIF");
      
      // Look for EXIF IFD pointer
      const exifIfdOffset = findTagValue(dataView, offset, offset + ifdOffset, littleEndian, 0x8769);
      if (exifIfdOffset) {
        parseIFD(dataView, offset, offset + exifIfdOffset, littleEndian, entries, "EXIF");
      }
      
      // Look for GPS IFD pointer
      const gpsIfdOffset = findTagValue(dataView, offset, offset + ifdOffset, littleEndian, 0x8825);
      if (gpsIfdOffset) {
        parseGpsIFD(dataView, offset, offset + gpsIfdOffset, littleEndian, entries);
      }
    } catch (e) {
      console.error("Error parsing EXIF from offset:", e);
    }
  }

  function extractGifMetadata(dataView: DataView) {
    const entries: MetadataEntry[] = [];
    
    try {
      // GIF Header: "GIF87a" or "GIF89a"
      const version = String.fromCharCode(
        dataView.getUint8(0),
        dataView.getUint8(1),
        dataView.getUint8(2),
        dataView.getUint8(3),
        dataView.getUint8(4),
        dataView.getUint8(5)
      );
      entries.push({ tag: "Format", value: version, category: "Image" });
      
      // Logical Screen Descriptor
      const width = dataView.getUint16(6, true);
      const height = dataView.getUint16(8, true);
      entries.push({ tag: "ImageWidth", value: width.toString(), category: "Image" });
      entries.push({ tag: "ImageHeight", value: height.toString(), category: "Image" });
      
      // Packed field
      const packed = dataView.getUint8(10);
      const hasGlobalColorTable = (packed & 0x80) !== 0;
      const colorResolution = ((packed >> 4) & 0x07) + 1;
      const sortFlag = (packed & 0x08) !== 0;
      const globalColorTableSize = hasGlobalColorTable ? Math.pow(2, (packed & 0x07) + 1) : 0;
      
      entries.push({ tag: "ColorResolution", value: `${colorResolution} bits`, category: "Image" });
      entries.push({ tag: "GlobalColorTable", value: hasGlobalColorTable ? `Yes (${globalColorTableSize} colors)` : "No", category: "Image" });
      if (sortFlag && hasGlobalColorTable) {
        entries.push({ tag: "ColorsSorted", value: "Yes", category: "Image" });
      }
      
      // Background color index and pixel aspect ratio
      const bgColorIndex = dataView.getUint8(11);
      const pixelAspectRatio = dataView.getUint8(12);
      
      if (hasGlobalColorTable) {
        entries.push({ tag: "BackgroundColorIndex", value: bgColorIndex.toString(), category: "Image" });
      }
      if (pixelAspectRatio !== 0) {
        const ratio = (pixelAspectRatio + 15) / 64;
        entries.push({ tag: "PixelAspectRatio", value: ratio.toFixed(2), category: "Image" });
      }
      
      // Skip global color table and look for extensions
      let offset = 13 + (hasGlobalColorTable ? globalColorTableSize * 3 : 0);
      let frameCount = 0;
      let totalDuration = 0;
      let hasComment = false;
      
      while (offset < dataView.byteLength - 1) {
        const introducer = dataView.getUint8(offset);
        
        if (introducer === 0x3b) {
          // Trailer - end of GIF
          break;
        } else if (introducer === 0x21) {
          // Extension block
          const label = dataView.getUint8(offset + 1);
          
          if (label === 0xf9) {
            // Graphic Control Extension
            const blockSize = dataView.getUint8(offset + 2);
            if (blockSize >= 4) {
              const gcPacked = dataView.getUint8(offset + 3);
              const delayTime = dataView.getUint16(offset + 4, true);
              const transparentIndex = dataView.getUint8(offset + 6);
              const hasTransparency = (gcPacked & 0x01) !== 0;
              const disposalMethod = (gcPacked >> 2) & 0x07;
              
              totalDuration += delayTime * 10; // delay is in 1/100 seconds
              
              if (frameCount === 0) {
                // Report details for first frame
                if (hasTransparency) {
                  entries.push({ tag: "Transparency", value: `Yes (index ${transparentIndex})`, category: "Image" });
                }
                const disposalMethods = ["Not specified", "Keep", "Restore background", "Restore previous"];
                entries.push({ tag: "DisposalMethod", value: disposalMethods[disposalMethod] || `Unknown (${disposalMethod})`, category: "Animation" });
              }
            }
            offset += 2 + blockSize + 1;
            // Skip sub-blocks
            while (offset < dataView.byteLength && dataView.getUint8(offset) !== 0) {
              offset += dataView.getUint8(offset) + 1;
            }
            offset++; // Skip block terminator
          } else if (label === 0xfe) {
            // Comment Extension
            hasComment = true;
            offset += 2;
            let comment = "";
            while (offset < dataView.byteLength && dataView.getUint8(offset) !== 0) {
              const subBlockSize = dataView.getUint8(offset);
              for (let i = 1; i <= subBlockSize && offset + i < dataView.byteLength; i++) {
                comment += String.fromCharCode(dataView.getUint8(offset + i));
              }
              offset += subBlockSize + 1;
            }
            offset++; // Skip block terminator
            if (comment.trim()) {
              entries.push({ tag: "Comment", value: comment.substring(0, 500), category: "Text" });
            }
          } else if (label === 0xff) {
            // Application Extension
            offset += 2;
            const blockSize = dataView.getUint8(offset);
            if (blockSize >= 11) {
              const appId = String.fromCharCode(
                dataView.getUint8(offset + 1),
                dataView.getUint8(offset + 2),
                dataView.getUint8(offset + 3),
                dataView.getUint8(offset + 4),
                dataView.getUint8(offset + 5),
                dataView.getUint8(offset + 6),
                dataView.getUint8(offset + 7),
                dataView.getUint8(offset + 8)
              );
              
              if (appId === "NETSCAPE") {
                // NETSCAPE2.0 extension - animation loop
                offset += blockSize + 1;
                const subBlockSize = dataView.getUint8(offset);
                if (subBlockSize >= 3 && dataView.getUint8(offset + 1) === 1) {
                  const loopCount = dataView.getUint16(offset + 2, true);
                  entries.push({ tag: "LoopCount", value: loopCount === 0 ? "Infinite" : loopCount.toString(), category: "Animation" });
                }
              } else {
                entries.push({ tag: "ApplicationExtension", value: appId.trim(), category: "Text" });
              }
            }
            offset += blockSize + 1;
            // Skip sub-blocks
            while (offset < dataView.byteLength && dataView.getUint8(offset) !== 0) {
              offset += dataView.getUint8(offset) + 1;
            }
            offset++; // Skip block terminator
          } else {
            // Unknown extension - skip
            offset += 2;
            while (offset < dataView.byteLength && dataView.getUint8(offset) !== 0) {
              offset += dataView.getUint8(offset) + 1;
            }
            offset++; // Skip block terminator
          }
        } else if (introducer === 0x2c) {
          // Image Descriptor
          frameCount++;
          
          if (frameCount === 1) {
            // Report details for first frame
            const left = dataView.getUint16(offset + 1, true);
            const top = dataView.getUint16(offset + 3, true);
            const frameWidth = dataView.getUint16(offset + 5, true);
            const frameHeight = dataView.getUint16(offset + 7, true);
            const imgPacked = dataView.getUint8(offset + 9);
            const hasLocalColorTable = (imgPacked & 0x80) !== 0;
            const isInterlaced = (imgPacked & 0x40) !== 0;
            
            if (left !== 0 || top !== 0) {
              entries.push({ tag: "FirstFramePosition", value: `${left}, ${top}`, category: "Image" });
            }
            if (frameWidth !== width || frameHeight !== height) {
              entries.push({ tag: "FirstFrameSize", value: `${frameWidth}x${frameHeight}`, category: "Image" });
            }
            if (isInterlaced) {
              entries.push({ tag: "Interlaced", value: "Yes", category: "Image" });
            }
            if (hasLocalColorTable) {
              const localColors = Math.pow(2, (imgPacked & 0x07) + 1);
              entries.push({ tag: "LocalColorTable", value: `Yes (${localColors} colors)`, category: "Image" });
            }
          }
          
          // Skip image descriptor and data
          offset += 10;
          const imgPacked = dataView.getUint8(offset - 1);
          const hasLocalColorTable = (imgPacked & 0x80) !== 0;
          if (hasLocalColorTable) {
            const localColorTableSize = Math.pow(2, (imgPacked & 0x07) + 1);
            offset += localColorTableSize * 3;
          }
          offset++; // LZW minimum code size
          // Skip sub-blocks
          while (offset < dataView.byteLength && dataView.getUint8(offset) !== 0) {
            offset += dataView.getUint8(offset) + 1;
          }
          offset++; // Skip block terminator
        } else {
          // Unknown block - try to skip
          offset++;
        }
      }
      
      if (frameCount > 1) {
        entries.push({ tag: "Animated", value: "Yes", category: "Animation" });
        entries.push({ tag: "FrameCount", value: frameCount.toString(), category: "Animation" });
        if (totalDuration > 0) {
          entries.push({ tag: "Duration", value: `${(totalDuration / 1000).toFixed(2)}s`, category: "Animation" });
          entries.push({ tag: "AverageFrameDelay", value: `${(totalDuration / frameCount).toFixed(0)}ms`, category: "Animation" });
        }
      }
    } catch (e) {
      console.error("Error parsing GIF:", e);
    }
    
    metadata = entries;
  }

  function extractJpegMetadata(dataView: DataView) {
    const entries: MetadataEntry[] = [];
    let offset = 2;

    while (offset < dataView.byteLength - 2) {
      const marker = dataView.getUint16(offset);
      
      if (marker === 0xffd9) break; // End of image
      if ((marker & 0xff00) !== 0xff00) break; // Invalid marker

      offset += 2;

      // Skip markers without length
      if (marker === 0xffd0 || marker === 0xffd1 || marker === 0xffd2 || 
          marker === 0xffd3 || marker === 0xffd4 || marker === 0xffd5 ||
          marker === 0xffd6 || marker === 0xffd7 || marker === 0xffd8) {
        continue;
      }

      if (offset >= dataView.byteLength - 2) break;
      const length = dataView.getUint16(offset);

      // APP1 marker (EXIF)
      if (marker === 0xffe1) {
        const exifHeader = dataView.getUint32(offset + 2);
        if (exifHeader === 0x45786966) { // "Exif"
          parseExif(dataView, offset + 8, entries);
        }
      }

      // SOF0, SOF1, SOF2 markers (image dimensions)
      if (marker === 0xffc0 || marker === 0xffc1 || marker === 0xffc2) {
        const height = dataView.getUint16(offset + 3);
        const width = dataView.getUint16(offset + 5);
        entries.push({ tag: "ImageWidth", value: width.toString(), category: "Image" });
        entries.push({ tag: "ImageHeight", value: height.toString(), category: "Image" });
      }

      offset += length;
    }

    metadata = entries;
  }

  function parseExif(dataView: DataView, tiffOffset: number, entries: MetadataEntry[]) {
    try {
      const byteOrder = dataView.getUint16(tiffOffset);
      const littleEndian = byteOrder === 0x4949; // "II"

      const ifdOffset = dataView.getUint32(tiffOffset + 4, littleEndian);
      parseIFD(dataView, tiffOffset, tiffOffset + ifdOffset, littleEndian, entries, "Image");

      // Look for EXIF IFD pointer (tag 0x8769)
      const exifIfdOffset = findTagValue(dataView, tiffOffset, tiffOffset + ifdOffset, littleEndian, 0x8769);
      if (exifIfdOffset) {
        parseIFD(dataView, tiffOffset, tiffOffset + exifIfdOffset, littleEndian, entries, "EXIF");
      }

      // Look for GPS IFD pointer (tag 0x8825)
      const gpsIfdOffset = findTagValue(dataView, tiffOffset, tiffOffset + ifdOffset, littleEndian, 0x8825);
      if (gpsIfdOffset) {
        parseGpsIFD(dataView, tiffOffset, tiffOffset + gpsIfdOffset, littleEndian, entries);
      }
    } catch (e) {
      console.error("Error parsing EXIF:", e);
    }
  }

  function parseGpsIFD(dataView: DataView, tiffOffset: number, ifdOffset: number, littleEndian: boolean, entries: MetadataEntry[]) {
    try {
      if (ifdOffset >= dataView.byteLength - 2) return;
      
      const numEntries = dataView.getUint16(ifdOffset, littleEndian);
      
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdOffset + 2 + i * 12;
        if (entryOffset + 12 > dataView.byteLength) break;

        const tag = dataView.getUint16(entryOffset, littleEndian);
        const type = dataView.getUint16(entryOffset + 2, littleEndian);
        const count = dataView.getUint32(entryOffset + 4, littleEndian);
        
        // GPS specific tags
        if (tag === 0x0001) { // GPSLatitudeRef
          const value = readTagValue(dataView, tiffOffset, entryOffset, type, count, littleEndian);
          if (value) {
            gpsData.latitudeRef = value.trim();
            entries.push({ tag: "GPSLatitudeRef", value: value, category: "GPS" });
          }
        } else if (tag === 0x0002) { // GPSLatitude
          const coords = readGpsCoordinate(dataView, tiffOffset, entryOffset, littleEndian);
          if (coords !== null) {
            gpsData.latitude = coords;
            entries.push({ tag: "GPSLatitude", value: formatDMS(coords), category: "GPS" });
          }
        } else if (tag === 0x0003) { // GPSLongitudeRef
          const value = readTagValue(dataView, tiffOffset, entryOffset, type, count, littleEndian);
          if (value) {
            gpsData.longitudeRef = value.trim();
            entries.push({ tag: "GPSLongitudeRef", value: value, category: "GPS" });
          }
        } else if (tag === 0x0004) { // GPSLongitude
          const coords = readGpsCoordinate(dataView, tiffOffset, entryOffset, littleEndian);
          if (coords !== null) {
            gpsData.longitude = coords;
            entries.push({ tag: "GPSLongitude", value: formatDMS(coords), category: "GPS" });
          }
        } else {
          // Other GPS tags
          const tagInfo = exifTags[tag];
          const tagName = tagInfo?.name || `GPSTag_0x${tag.toString(16).padStart(4, "0")}`;
          const value = readTagValue(dataView, tiffOffset, entryOffset, type, count, littleEndian);
          if (value !== null && value !== "") {
            entries.push({ tag: tagName, value: String(value).substring(0, 500), category: "GPS" });
          }
        }
      }
    } catch (e) {
      console.error("Error parsing GPS IFD:", e);
    }
  }

  function readGpsCoordinate(dataView: DataView, tiffOffset: number, entryOffset: number, littleEndian: boolean): number | null {
    try {
      const count = dataView.getUint32(entryOffset + 4, littleEndian);
      if (count !== 3) return null; // GPS coordinates have 3 rationals (degrees, minutes, seconds)
      
      const valueOffset = tiffOffset + dataView.getUint32(entryOffset + 8, littleEndian);
      
      const degNum = dataView.getUint32(valueOffset, littleEndian);
      const degDen = dataView.getUint32(valueOffset + 4, littleEndian);
      const minNum = dataView.getUint32(valueOffset + 8, littleEndian);
      const minDen = dataView.getUint32(valueOffset + 12, littleEndian);
      const secNum = dataView.getUint32(valueOffset + 16, littleEndian);
      const secDen = dataView.getUint32(valueOffset + 20, littleEndian);
      
      const degrees = degDen !== 0 ? degNum / degDen : 0;
      const minutes = minDen !== 0 ? minNum / minDen : 0;
      const seconds = secDen !== 0 ? secNum / secDen : 0;
      
      return degrees + minutes / 60 + seconds / 3600;
    } catch (e) {
      return null;
    }
  }

  function formatDMS(decimal: number): string {
    const degrees = Math.floor(decimal);
    const minutesFloat = (decimal - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = ((minutesFloat - minutes) * 60).toFixed(2);
    return `${degrees}° ${minutes}' ${seconds}"`;
  }

  function findTagValue(dataView: DataView, tiffOffset: number, ifdOffset: number, littleEndian: boolean, targetTag: number): number | null {
    try {
      const numEntries = dataView.getUint16(ifdOffset, littleEndian);
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdOffset + 2 + i * 12;
        const tag = dataView.getUint16(entryOffset, littleEndian);
        if (tag === targetTag) {
          return dataView.getUint32(entryOffset + 8, littleEndian);
        }
      }
    } catch (e) {
      // Ignore errors
    }
    return null;
  }

  function parseIFD(dataView: DataView, tiffOffset: number, ifdOffset: number, littleEndian: boolean, entries: MetadataEntry[], defaultCategory: string) {
    try {
      if (ifdOffset >= dataView.byteLength - 2) return;
      
      const numEntries = dataView.getUint16(ifdOffset, littleEndian);
      
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdOffset + 2 + i * 12;
        if (entryOffset + 12 > dataView.byteLength) break;

        const tag = dataView.getUint16(entryOffset, littleEndian);
        const type = dataView.getUint16(entryOffset + 2, littleEndian);
        const count = dataView.getUint32(entryOffset + 4, littleEndian);
        
        const tagInfo = exifTags[tag];
        const tagName = tagInfo?.name || `Tag_0x${tag.toString(16).padStart(4, "0")}`;
        const category = tagInfo?.category || defaultCategory;

        const value = readTagValue(dataView, tiffOffset, entryOffset, type, count, littleEndian);
        if (value !== null && value !== "") {
          entries.push({ tag: tagName, value: String(value).substring(0, 500), category });
        }
      }
    } catch (e) {
      console.error("Error parsing IFD:", e);
    }
  }

  function readTagValue(dataView: DataView, tiffOffset: number, entryOffset: number, type: number, count: number, littleEndian: boolean): string | null {
    try {
      const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
      const size = (typeSize[type] || 1) * count;
      
      let valueOffset = entryOffset + 8;
      if (size > 4) {
        valueOffset = tiffOffset + dataView.getUint32(entryOffset + 8, littleEndian);
      }

      if (valueOffset + size > dataView.byteLength) return null;

      switch (type) {
        case 1: // BYTE
        case 7: // UNDEFINED
          if (count === 1) return dataView.getUint8(valueOffset).toString();
          const bytes = [];
          for (let i = 0; i < Math.min(count, 32); i++) {
            bytes.push(dataView.getUint8(valueOffset + i));
          }
          return bytes.join(", ");
        case 2: // ASCII
          const chars = [];
          for (let i = 0; i < count - 1; i++) {
            const c = dataView.getUint8(valueOffset + i);
            if (c === 0) break;
            chars.push(String.fromCharCode(c));
          }
          return chars.join("");
        case 3: // SHORT
          if (count === 1) return dataView.getUint16(valueOffset, littleEndian).toString();
          const shorts = [];
          for (let i = 0; i < Math.min(count, 16); i++) {
            shorts.push(dataView.getUint16(valueOffset + i * 2, littleEndian));
          }
          return shorts.join(", ");
        case 4: // LONG
          if (count === 1) return dataView.getUint32(valueOffset, littleEndian).toString();
          const longs = [];
          for (let i = 0; i < Math.min(count, 8); i++) {
            longs.push(dataView.getUint32(valueOffset + i * 4, littleEndian));
          }
          return longs.join(", ");
        case 5: // RATIONAL
          const num = dataView.getUint32(valueOffset, littleEndian);
          const den = dataView.getUint32(valueOffset + 4, littleEndian);
          if (den === 0) return "0";
          return (num / den).toFixed(4).replace(/\.?0+$/, "");
        case 9: // SLONG
          return dataView.getInt32(valueOffset, littleEndian).toString();
        case 10: // SRATIONAL
          const snum = dataView.getInt32(valueOffset, littleEndian);
          const sden = dataView.getInt32(valueOffset + 4, littleEndian);
          if (sden === 0) return "0";
          return (snum / sden).toFixed(4).replace(/\.?0+$/, "");
        default:
          return null;
      }
    } catch (e) {
      return null;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  async function removeMetadata() {
    if (!imageFile) return;
    
    isLoading = true;
    error = null;

    try {
      // Create a canvas to redraw the image without metadata
      const img = new Image();
      img.src = imageUrl!;
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");
      
      ctx.drawImage(img, 0, 0);

      // Get the clean image as blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Failed to create blob"));
        }, imageFile!.type === "image/png" ? "image/png" : "image/jpeg", 0.95);
      });

      // Download the clean image
      const link = document.createElement("a");
      const cleanFileName = imageFile.name.replace(/(\.[^.]+)$/, "_clean$1");
      link.href = URL.createObjectURL(blob);
      link.download = cleanFileName;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      error = "Failed to remove metadata";
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  function copyMetadata() {
    const text = metadata
      .map((m) => `${m.tag}: ${m.value}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  function clearImage() {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    imageFile = null;
    imageUrl = null;
    metadata = [];
    gpsData = { latitude: null, latitudeRef: null, longitude: null, longitudeRef: null };
    error = null;
  }

  // Compute decimal GPS coordinates with proper sign
  let gpsCoordinates = $derived.by(() => {
    if (gpsData.latitude === null || gpsData.longitude === null) return null;
    
    let lat = gpsData.latitude;
    let lng = gpsData.longitude;
    
    // Apply reference direction
    if (gpsData.latitudeRef === "S") lat = -lat;
    if (gpsData.longitudeRef === "W") lng = -lng;
    
    return { lat, lng };
  });

  let googleMapsUrl = $derived(
    gpsCoordinates 
      ? `https://www.google.com/maps?q=${gpsCoordinates.lat},${gpsCoordinates.lng}`
      : null
  );

  // OpenStreetMap static map preview URL
  let osmMapUrl = $derived(
    gpsCoordinates
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${gpsCoordinates.lng - 0.01},${gpsCoordinates.lat - 0.01},${gpsCoordinates.lng + 0.01},${gpsCoordinates.lat + 0.01}&layer=mapnik&marker=${gpsCoordinates.lat},${gpsCoordinates.lng}`
      : null
  );

  // OpenStreetMap link URL
  let osmLinkUrl = $derived(
    gpsCoordinates
      ? `https://www.openstreetmap.org/?mlat=${gpsCoordinates.lat}&mlon=${gpsCoordinates.lng}#map=15/${gpsCoordinates.lat}/${gpsCoordinates.lng}`
      : null
  );

  // Group metadata by category
  let groupedMetadata = $derived(
    metadata.reduce((acc, entry) => {
      if (!acc[entry.category]) {
        acc[entry.category] = [];
      }
      acc[entry.category].push(entry);
      return acc;
    }, {} as Record<string, MetadataEntry[]>)
  );

  let categories = $derived(Object.keys(groupedMetadata));
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      View and remove EXIF metadata from images. Supports JPEG, PNG, WebP, and GIF files.
    </p>
  </header>

  {#if !imageFile}
    <!-- Drop Zone -->
    <div
      class="flex-1 flex items-center justify-center border-2 border-dashed border-(--color-border) transition-colors {dragOver ? 'border-(--color-accent) bg-(--color-accent)/5' : ''}"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      role="button"
      tabindex="0"
    >
      <div class="text-center p-8">
        <div class="text-6xl mb-4">
          <span class="opacity-50">🖼️</span>
        </div>
        <p class="text-(--color-text) mb-2">Drag and drop an image here</p>
        <p class="text-sm text-(--color-text-muted) mb-4">or</p>
        <label class="inline-block px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium cursor-pointer hover:bg-(--color-accent-hover) transition-colors">
          Browse Files
          <input
            type="file"
            accept="image/*"
            onchange={handleFileSelect}
            class="hidden"
          />
        </label>
        <p class="text-xs text-(--color-text-muted) mt-4">
          Supports JPEG, PNG, WebP, and GIF formats
        </p>
      </div>
    </div>
  {:else}
    <!-- Image and Metadata View -->
    <div class="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
      <!-- Image Preview -->
      <div class="lg:w-80 flex flex-col gap-4">
        <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          <div class="aspect-square bg-black/5 flex items-center justify-center overflow-hidden mb-4">
            <img
              src={imageUrl}
              alt="Preview"
              class="max-w-full max-h-full object-contain"
            />
          </div>
          <div class="flex flex-col gap-2">
            <button
              onclick={removeMetadata}
              disabled={isLoading}
              class="w-full px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Remove Metadata & Download"}
            </button>
            <button
              onclick={clearImage}
              class="w-full px-4 py-2 border border-(--color-border) text-(--color-text) text-sm font-medium hover:bg-(--color-bg) transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <!-- GPS Map Preview (under image) -->
        {#if gpsCoordinates && osmMapUrl}
          <div class="border border-(--color-border) bg-(--color-bg-alt) p-4">
            <div class="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-(--color-accent)">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span class="text-sm font-medium text-(--color-text)">Photo Location</span>
            </div>
            <div class="border border-(--color-border) overflow-hidden mb-3" style="height: 180px;">
              <iframe
                title="Location Map"
                src={osmMapUrl}
                width="100%"
                height="100%"
                style="border: 0;"
                loading="lazy"
              ></iframe>
            </div>
            <div class="text-xs text-(--color-text-muted) mb-3 font-mono">
              {gpsCoordinates.lat.toFixed(6)}, {gpsCoordinates.lng.toFixed(6)}
            </div>
            <div class="flex gap-2">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 px-3 py-1.5 text-xs text-center border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors flex items-center justify-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                Google
              </a>
              <a
                href={osmLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 px-3 py-1.5 text-xs text-center border border-(--color-border) text-(--color-text) hover:bg-(--color-bg) transition-colors flex items-center justify-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                OSM
              </a>
            </div>
          </div>
        {/if}
      </div>

      <!-- Metadata Display -->
      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm uppercase tracking-wider text-(--color-text-light) font-medium">
            Metadata ({metadata.length} entries)
          </h3>
          {#if metadata.length > 0}
            <button
              onclick={copyMetadata}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              {copied ? "Copied!" : "Copy All"}
            </button>
          {/if}
        </div>

        {#if error}
          <div class="p-4 border border-red-500/30 bg-red-500/10 text-red-500 text-sm mb-4">
            {error}
          </div>
        {/if}

        {#if isLoading}
          <div class="flex-1 flex items-center justify-center">
            <p class="text-(--color-text-muted)">Loading metadata...</p>
          </div>
        {:else if metadata.length === 0}
          <div class="flex-1 flex items-center justify-center border border-(--color-border) bg-(--color-bg-alt)">
            <p class="text-(--color-text-muted)">No metadata found in this image</p>
          </div>
        {:else}
          <div class="flex-1 overflow-auto border border-(--color-border) bg-(--color-bg-alt)">
            {#each categories as category}
              <div class="border-b border-(--color-border) last:border-b-0">
                <div class="px-4 py-2 bg-(--color-bg) border-b border-(--color-border)">
                  <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
                    {category}
                  </span>
                </div>
                <div class="divide-y divide-(--color-border)">
                  {#each groupedMetadata[category] as entry}
                    <div class="px-4 py-2 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                      <span class="text-sm font-medium text-(--color-text) sm:w-48 shrink-0">
                        {entry.tag}
                      </span>
                      <span class="text-sm text-(--color-text-muted) break-all">
                        {entry.value}
                      </span>
                    </div>
                  {/each}
                  {#if category === "GPS" && gpsCoordinates}
                    <div class="px-4 py-2 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 bg-(--color-accent)/5">
                      <span class="text-sm font-medium text-(--color-text) sm:w-48 shrink-0">
                        Coordinates
                      </span>
                      <span class="text-sm text-(--color-text-muted) break-all">
                        {gpsCoordinates.lat.toFixed(6)}, {gpsCoordinates.lng.toFixed(6)}
                      </span>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
