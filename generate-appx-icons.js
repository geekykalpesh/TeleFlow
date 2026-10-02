const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputImagePath = path.join(__dirname, 'build', 'icon.png');
const appxDir = path.join(__dirname, 'build', 'appx');

if (!fs.existsSync(appxDir)) {
    fs.mkdirSync(appxDir, { recursive: true });
}

async function generateIcons() {
    try {
        console.log('Generating AppX icons...');
        
        // StoreLogo.png - 50x50
        await sharp(inputImagePath)
            .resize(50, 50, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'StoreLogo.png'));
        
        // Square150x150Logo.png - 150x150
        await sharp(inputImagePath)
            .resize(150, 150, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'Square150x150Logo.png'));

        // Square44x44Logo.png - 44x44
        await sharp(inputImagePath)
            .resize(44, 44, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'Square44x44Logo.png'));

        // Wide310x150Logo.png - 310x150
        await sharp(inputImagePath)
            .resize(310, 150, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'Wide310x150Logo.png'));
            
        // Optional extras to be safe:
        // BadgeLogo.png - 24x24 (often monochrome, but we'll scale it down)
        await sharp(inputImagePath)
            .resize(24, 24, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'BadgeLogo.png'));

        // Square71x71Logo.png - 71x71
        await sharp(inputImagePath)
            .resize(71, 71, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'Square71x71Logo.png'));

        // Square310x310Logo.png - 310x310
        await sharp(inputImagePath)
            .resize(310, 310, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'Square310x310Logo.png'));

        // SplashScreen.png - 620x300
        await sharp(inputImagePath)
            .resize(620, 300, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toFile(path.join(appxDir, 'SplashScreen.png'));

        console.log('AppX icons generated successfully!');
    } catch (error) {
        console.error('Error generating icons:', error);
    }
}

generateIcons();
