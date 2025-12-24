const Category = require("../models/Category");

const addCategory = async (req, res) => {
  try {
    // Get the highest order value and add 1 for new category
    const lastCategory = await Category.findOne({}).sort({ order: -1 });
    const newOrder = lastCategory && lastCategory.order !== undefined ? lastCategory.order + 1 : 0;
    
    // Ensure all categories are parent categories (no parentId)
    const categoryData = {
      ...req.body,
      parentId: null, // Explicitly set to null to ensure it's a parent category
      order: req.body.order !== undefined ? req.body.order : newOrder,
    };
    const newCategory = new Category(categoryData);
    await newCategory.save();
    res.status(200).send({
      message: "Category Added Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// all multiple category
const addAllCategory = async (req, res) => {
  // console.log("category", req.body);
  try {
    await Category.deleteMany();

    await Category.insertMany(req.body);

    res.status(200).send({
      message: "Category Added Successfully!",
    });
  } catch (err) {
    // console.log(err.message);

    res.status(500).send({
      message: err.message,
    });
  }
};

// get status show category
const getShowingCategory = async (req, res) => {
  try {
    // Get all parent categories with status "show"
    const categories = await Category.find({ 
      status: "show",
      $or: [
        { parentId: { $exists: false } },
        { parentId: null },
        { parentId: "" }
      ]
    }).sort({
      order: 1,
      _id: -1,
    });

    // Return in the format expected by frontend: wrap in array with children property
    // Frontend expects categories[0].children, so we wrap all categories as children of a dummy parent
    const categoryList = [{
      _id: "root",
      name: { en: "All Categories" },
      children: categories.map(cat => ({
        _id: cat._id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        status: cat.status,
        parentId: cat.parentId,
        children: [] // Empty children array since all are parent categories
      }))
    }];
    
    res.send(categoryList);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// get all category parent and child
const getAllCategory = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ _id: -1 });

    const categoryList = readyToParentAndChildrenCategory(categories);
    //  console.log('categoryList',categoryList)
    res.send(categoryList);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getAllCategories = async (req, res) => {
  try {
    // Get all categories - return only parent categories
    // Filter out any categories that have a parentId set (those are subcategories)
    const allCategories = await Category.find({}).sort({ order: 1, _id: -1 });
    
    // Filter to show only parent categories (where parentId is null, undefined, empty, or doesn't exist)
    const parentCategories = allCategories.filter(cat => {
      const parentId = cat.parentId;
      // Return true if parentId is falsy or empty
      return !parentId || parentId === null || parentId === undefined || parentId === "";
    });

    res.send(parentCategories);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    res.send(category);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// category update
const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (category) {
      category.name = { ...category.name, ...req.body.name };
      category.description = {
        ...category.description,
        ...req.body.description,
      };
      category.icon = req.body.icon;
      category.status = req.body.status;
      // Ensure category remains a parent category (no parentId)
      category.parentId = null;
      category.parentName = req.body.parentName || null;

      await category.save();
      res.send({ message: "Category Updated Successfully!" });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// udpate many category
const updateManyCategory = async (req, res) => {
  try {
    const updatedData = {};
    for (const key of Object.keys(req.body)) {
      if (
        req.body[key] !== "[]" &&
        Object.entries(req.body[key]).length > 0 &&
        req.body[key] !== req.body.ids
      ) {
        updatedData[key] = req.body[key];
      }
    }

    await Category.updateMany(
      { _id: { $in: req.body.ids } },
      {
        $set: updatedData,
      },
      {
        multi: true,
      }
    );

    res.send({
      message: "Categories update successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// category update status
const updateStatus = async (req, res) => {
  // console.log('update status')
  try {
    const newStatus = req.body.status;

    await Category.updateOne(
      { _id: req.params.id },
      {
        $set: {
          status: newStatus,
        },
      }
    );
    res.status(200).send({
      message: `Category ${
        newStatus === "show" ? "Published" : "Un-Published"
      } Successfully!`,
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};
//single category delete
const deleteCategory = async (req, res) => {
  try {
    console.log("id cat >>", req.params.id);
    await Category.deleteOne({ _id: req.params.id });
    await Category.deleteMany({ parentId: req.params.id });
    res.status(200).send({
      message: "Category Deleted Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }

  //This is for delete children category
  // Category.updateOne(
  //   { _id: req.params.id },
  //   {
  //     $pull: { children: req.body.title },
  //   },
  //   (err) => {
  //     if (err) {
  //       res.status(500).send({ message: err.message });
  //     } else {
  //       res.status(200).send({
  //         message: 'Category Deleted Successfully!',
  //       });
  //     }
  //   }
  // );
};

// all multiple category delete
const deleteManyCategory = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ _id: -1 });

    await Category.deleteMany({ parentId: req.body.ids });
    await Category.deleteMany({ _id: req.body.ids });

    res.status(200).send({
      message: "Categories Deleted Successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};
const readyToParentAndChildrenCategory = (categories, parentId = null) => {
  const categoryList = [];
  let Categories;
  if (parentId == null) {
    Categories = categories.filter((cat) => cat.parentId == undefined);
  } else {
    Categories = categories.filter((cat) => cat.parentId == parentId);
  }

  for (let cate of Categories) {
    categoryList.push({
      _id: cate._id,
      name: cate.name,
      parentId: cate.parentId,
      parentName: cate.parentName,
      description: cate.description,
      icon: cate.icon,
      status: cate.status,
      children: readyToParentAndChildrenCategory(categories, cate._id),
    });
  }

  return categoryList;
};

// update category order
const updateCategoryOrder = async (req, res) => {
  try {
    const { categories } = req.body; // Array of { _id, order }
    
    if (!Array.isArray(categories)) {
      return res.status(400).send({
        message: "Categories must be an array",
      });
    }

    // Update all categories with their new order
    const updatePromises = categories.map(({ _id, order }) => {
      return Category.findByIdAndUpdate(
        _id,
        { order: order || 0 },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    res.status(200).send({
      message: "Category order updated successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

module.exports = {
  addCategory,
  addAllCategory,
  getAllCategory,
  getShowingCategory,
  getCategoryById,
  updateCategory,
  updateStatus,
  deleteCategory,
  deleteManyCategory,
  getAllCategories,
  updateManyCategory,
  updateCategoryOrder,
};
