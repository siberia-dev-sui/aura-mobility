import os
import re
import requests
from urllib.parse import urlparse

# Configuration
BACKUP_HTML = 'index.html.bak'
IMAGES_DIR = 'images'
CSS_URL = 'https://assets.website-files.com/615c647d100bcdc731534a25/css/medidot.62a50d1f4.css'

def download_file(url, dest_folder):
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)
    
    filename = os.path.basename(urlparse(url).path)
    dest_path = os.path.join(dest_folder, filename)
    
    if os.path.exists(dest_path):
        print(f"Skipping {filename} (already exists)")
        return

    print(f"Downloading {filename} from {url}...")
    try:
        response = requests.get(url)
        response.raise_for_status()
        with open(dest_path, 'wb') as f:
            f.write(response.content)
        print(f"Success: {filename}")
    except Exception as e:
        print(f"Failed to download {url}: {e}")

def extract_urls_from_html(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Regex to find URLs in src, srcset, href, etc.
    # Looking for assets.website-files.com and cdn.prod.website-files.com
    urls = re.findall(r'(https?://(?:assets\.website-files\.com|cdn\.prod\.website-files\.com)/[^"\s\)]+)', content)
    
    # Clean up URLs (remove query params or trailing characters if regex grabbed too much)
    clean_urls = []
    for url in urls:
        # Basic cleanup, might need more refinement
        url = url.split(' ')[0] # Handle srcset width descriptors
        if url.lower().endswith(('.jpg', '.jpeg', '.png', '.svg', '.gif', '.ico')):
            clean_urls.append(url)
            
    return list(set(clean_urls))

def extract_urls_from_css(css_content):
    # Regex for url(...)
    urls = re.findall(r'url\(["\']?(https?://[^"\')]+)["\']?\)', css_content)
    
    clean_urls = []
    for url in urls:
        if 'assets.website-files.com' in url or 'cdn.prod.website-files.com' in url:
             if url.lower().endswith(('.jpg', '.jpeg', '.png', '.svg', '.gif', '.ico')):
                clean_urls.append(url)
    return list(set(clean_urls))

def main():
    print("Starting asset recovery...")
    
    # 1. Extract from HTML
    if os.path.exists(BACKUP_HTML):
        print(f"Extracting URLs from {BACKUP_HTML}...")
        html_urls = extract_urls_from_html(BACKUP_HTML)
        print(f"Found {len(html_urls)} images in HTML.")
        for url in html_urls:
            download_file(url, IMAGES_DIR)
    else:
        print(f"Error: {BACKUP_HTML} not found.")

    # 2. Extract from CSS
    print(f"Downloading original CSS from {CSS_URL}...")
    try:
        response = requests.get(CSS_URL)
        response.raise_for_status()
        css_content = response.text
        
        print("Extracting URLs from CSS...")
        css_urls = extract_urls_from_css(css_content)
        print(f"Found {len(css_urls)} images in CSS.")
        for url in css_urls:
            download_file(url, IMAGES_DIR)
            
    except Exception as e:
        print(f"Failed to fetch CSS: {e}")

    print("Recovery complete.")

if __name__ == "__main__":
    main()
