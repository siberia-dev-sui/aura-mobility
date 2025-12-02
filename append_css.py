
css_path = 'css/style.css'
new_rule = """
/* Hide Webflow Badge */
.w-webflow-badge {
  display: none !important;
}
"""

try:
    with open(css_path, 'a') as f:
        f.write(new_rule)
    print("Successfully appended CSS rule.")
except Exception as e:
    print(f"Error appending CSS: {e}")
